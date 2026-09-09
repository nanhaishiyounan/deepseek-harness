import { useList, useOne, useTranslate } from "@refinedev/core";
import ReactECharts from "echarts-for-react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  Gauge,
  Mail,
  Pencil,
  Phone,
  Sparkles,
  Target,
  Trash2,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RouteDrawer } from "@/extensions/nocobase-route-surfaces";
import { cn } from "@/lib/utils";
import {
  CrmAIContext,
  CrmAIShortcut,
  useLeadDetailTasks,
  useLeadListTasks,
} from "../ai-assistant";
import { AuditTrail, CopyLinkButton, RelativeTime } from "../audit-trail";
import {
  CRM_CHART_COLORS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_LEAD_STATUSES,
  formatDate,
  labelFor,
} from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import { InlineEnumCell } from "../inline-edit";
import {
  BulkActionBar,
  BulkOwnerDialog,
  ColumnSettingsMenu,
  ExportCsvButton,
  KpiStrip,
  ListEmptyState,
  ListErrorState,
  SavedViewsMenu,
  SelectCell,
  SortableHeader,
  TableSkeleton,
  densityClass,
  useActiveViewName,
  useBulkMutation,
  useColumnPreferences,
  useListSorters,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ListSorter,
  type ViewPreset,
} from "../list-toolkit";
import {
  ListDateRange,
  ListFilterSelect,
  ListPagination,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  dateTimeRangeFilter,
  searchFilter,
  useDebouncedValue,
  useListPagination,
  useResetPageOnFilterChange,
} from "../list-controls";
import { ChartCard, MetricCard } from "../overview-cards";
import { useOwnerOptions } from "../pickers";
import { useRecordCursorSource } from "../record-cursor";
import { RecordPager } from "../record-pager";
import { useTrackRecentRecord } from "../recent-records";
import { useContextualCloseTo, useOpenContextualChild } from "../route-surfaces";
import { DRAWER_WIDE, DetailItems, DrawerSection, EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { LeadRecord } from "../types";
import { LeadConvertDialog } from "./convert-dialog";
import {
  GRADE_RANGES,
  gradeClass,
  gradeFor,
  modelledScore,
  scoreFactors,
  type LeadGrade,
} from "./scoring";

const LEAD_FILTER_DEFAULTS = {
  q: "",
  status: "all",
  source: "all",
  owner: "all",
  grade: "all",
  from: "",
  to: "",
  sort: "",
};

type LeadFilterState = typeof LEAD_FILTER_DEFAULTS;

const GRADES: LeadGrade[] = ["A", "B", "C", "D"];
const LEAD_DEFAULT_SORTERS: ListSorter[] = [{ field: "score", order: "desc" }];

function LeadGradeBadge({ score }: { score: number | null | undefined }) {
  const grade = gradeFor(score);
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-xs font-semibold",
        gradeClass(grade)
      )}
    >
      {grade}
    </span>
  );
}

export function LeadsPage() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<LeadFilterState>(LEAD_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const listSorters = useListSorters(
    state.sort,
    (next) => setState({ sort: next }),
    LEAD_DEFAULT_SORTERS
  );
  const { currentPage, pageSize, setCurrentPage, setPageSize } =
    useListPagination();
  const { options: ownerOptions } = useOwnerOptions();
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);

  const gradeRange = state.grade === "all" ? null : GRADE_RANGES[state.grade as LeadGrade];

  const filters = useMemo(
    () => [
      ...searchFilter(["name", "company", "email"], debouncedSearch),
      ...(state.status === "all"
        ? []
        : [{ field: "status", operator: "eq" as const, value: state.status }]),
      ...(state.source === "all"
        ? []
        : [{ field: "source", operator: "eq" as const, value: state.source }]),
      ...(state.owner === "all"
        ? []
        : [{ field: "owner_id", operator: "eq" as const, value: state.owner }]),
      ...(gradeRange
        ? [
            { field: "score", operator: "gte" as const, value: gradeRange.min },
            { field: "score", operator: "lte" as const, value: gradeRange.max },
          ]
        : []),
      ...dateTimeRangeFilter("createdAt", state.from, state.to),
    ],
    [debouncedSearch, gradeRange, state.owner, state.source, state.status, state.from, state.to]
  );
  useResetPageOnFilterChange(`${debouncedSearch}|${fingerprint}`, setCurrentPage);

  const { result, query } = useList<LeadRecord>({
    resource: "crm_leads",
    filters,
    pagination: { mode: "server", currentPage, pageSize },
    sorters: listSorters.sorters,
    meta: { appends: ["owner"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  // Pulled on demand so "Export CSV" writes the whole filtered set, not just
  // the page on screen.
  const exportQuery = useList<LeadRecord>({
    resource: "crm_leads",
    filters,
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: listSorters.sorters,
    meta: { appends: ["owner"] },
    errorNotification: false,
    queryOptions: { enabled: false, retry: false },
  });

  // Metrics describe the whole funnel, so they stay independent of the
  // table's page and filter state.
  const summary = useList<LeadRecord>({
    resource: "crm_leads",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    meta: { fields: ["id", "status", "score", "source"] },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const visible = result.data;
  useRecordCursorSource("lead", visible.map((row) => row.id));
  const allLeads = summary.result.data;
  const averageScore = allLeads.length
    ? Math.round(
        allLeads.reduce((sum, lead) => sum + Number(lead.score ?? 0), 0) /
          allLeads.length
      )
    : 0;
  const qualified = allLeads.filter((lead) =>
    ["qualified", "converted"].includes(lead.status ?? "")
  ).length;
  const converted = allLeads.filter((lead) => lead.status === "converted").length;
  const conversionRate = allLeads.length
    ? Math.round((converted / allLeads.length) * 100)
    : 0;
  const hotLeads = allLeads.filter((lead) => gradeFor(lead.score) === "A").length;
  const untouched = allLeads.filter((lead) => lead.status === "new").length;

  const selection = useRowSelection(visible.map((lead) => lead.id));
  const bulk = useBulkMutation("crm_leads");

  const statusOptions = useMemo(
    () =>
      LEAD_STATUSES.map((option) => ({
        value: option.value,
        label: labelFor(LEAD_STATUSES, option.value, translate),
      })),
    [translate]
  );
  const sourceOptions = useMemo(
    () =>
      LEAD_SOURCES.map((option) => ({
        value: option.value,
        label: labelFor(LEAD_SOURCES, option.value, translate),
      })),
    [translate]
  );
  const gradeOptions = useMemo(
    () =>
      GRADES.map((grade) => ({
        value: grade,
        label: translate(
          `crm.leads.grades.${grade}`,
          { ns: "starter" },
          `Grade ${grade} (${GRADE_RANGES[grade].min}-${GRADE_RANGES[grade].max})`
        ),
      })),
    [translate]
  );

  const presets = useMemo<ViewPreset<LeadFilterState>[]>(
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
        id: "hot",
        name: translate("crm.leads.views.hot", { ns: "starter" }, "Hot leads (A grade)"),
        state: { grade: "A" },
      },
      {
        id: "working",
        name: translate("crm.leads.views.working", { ns: "starter" }, "In progress"),
        state: { status: "working" },
      },
      {
        id: "untouched",
        name: translate("crm.leads.views.untouched", { ns: "starter" }, "Never worked"),
        state: { status: "new" },
      },
      {
        id: "referrals",
        name: translate("crm.leads.views.referrals", { ns: "starter" }, "Referrals & partners"),
        state: { source: "referral" },
      },
    ],
    [identity.userId, translate]
  );
  const savedViews = useSavedViews<LeadFilterState>("leads");
  const activeView = useActiveViewName(
    state,
    LEAD_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const columnOptions = useMemo(
    () => [
      { id: "lead", label: translate("crm.leads.fields.lead", { ns: "starter" }, "Lead"), locked: true },
      { id: "grade", label: translate("crm.leads.fields.grade", { ns: "starter" }, "Grade") },
      { id: "source", label: translate("crm.leads.fields.source", { ns: "starter" }, "Source") },
      { id: "status", label: translate("crm.leads.fields.status", { ns: "starter" }, "Status") },
      { id: "score", label: translate("crm.leads.fields.score", { ns: "starter" }, "Score") },
      { id: "owner", label: translate("crm.leads.fields.owner", { ns: "starter" }, "Owner") },
      { id: "createdAt", label: translate("crm.leads.fields.createdAt", { ns: "starter" }, "Created") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("leads", columnOptions);

  const csvColumns = useMemo<CsvColumn<LeadRecord>[]>(
    () => [
      { header: translate("crm.leads.fields.name", { ns: "starter" }, "Name"), value: (lead) => lead.name },
      { header: translate("crm.leads.fields.company", { ns: "starter" }, "Company"), value: (lead) => lead.company },
      { header: translate("crm.leads.fields.email", { ns: "starter" }, "Email"), value: (lead) => lead.email },
      { header: translate("crm.leads.fields.phone", { ns: "starter" }, "Phone"), value: (lead) => lead.phone },
      { header: translate("crm.leads.fields.source", { ns: "starter" }, "Source"), value: (lead) => labelFor(LEAD_SOURCES, lead.source, translate) },
      { header: translate("crm.leads.fields.status", { ns: "starter" }, "Status"), value: (lead) => labelFor(LEAD_STATUSES, lead.status, translate) },
      { header: translate("crm.leads.fields.score", { ns: "starter" }, "Score"), value: (lead) => lead.score ?? 0 },
      { header: translate("crm.leads.fields.grade", { ns: "starter" }, "Grade"), value: (lead) => gradeFor(lead.score) },
      { header: translate("crm.leads.fields.owner", { ns: "starter" }, "Owner"), value: (lead) => lead.owner?.nickname },
      { header: translate("crm.leads.fields.createdAt", { ns: "starter" }, "Created"), value: (lead) => formatDate(lead.createdAt, locale) },
    ],
    [locale, translate]
  );

  const exportCsv = async () => {
    const response = await exportQuery.query.refetch();
    const rows =
      (response.data as { data?: LeadRecord[] } | undefined)?.data ?? visible;
    downloadCsv(`crm-leads-${csvTimestamp()}.csv`, csvColumns, rows);
  };

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "qualify",
          label: translate("crm.leads.bulk.qualify", { ns: "starter" }, "Mark qualified"),
          icon: <CheckCircle2 className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "qualified" },
              translate("crm.leads.bulk.qualified", { ns: "starter" }, "Leads marked qualified")
            ),
        },
        {
          id: "disqualify",
          label: translate("crm.leads.bulk.disqualify", { ns: "starter" }, "Mark unqualified"),
          icon: <XCircle className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "unqualified" },
              translate("crm.leads.bulk.disqualified", { ns: "starter" }, "Leads marked unqualified")
            ),
        },
        {
          id: "owner",
          label: translate("crm.bulk.assignOwner", { ns: "starter" }, "Assign owner"),
          icon: <UserCog className="size-4" />,
          onRun: () => setOwnerDialogOpen(true),
        },
        {
          id: "delete",
          label: translate("crm.bulk.delete", { ns: "starter" }, "Delete"),
          icon: <Trash2 className="size-4" />,
          destructive: true,
          confirm: translate(
            "crm.bulk.deleteConfirm",
            { ns: "starter" },
            "The selected records are removed permanently. This cannot be undone."
          ),
          onRun: async (ids) => {
            const done = await bulk.remove(
              ids,
              translate("crm.bulk.deleted", { ns: "starter" }, "Records deleted")
            );
            if (done) selection.clear();
          },
        },
      ];
      return actions.filter(
        (action) => identity.isAdmin || action.id !== "delete"
      );
    },
    [bulk, identity.isAdmin, selection, translate]
  );

  const sourceRows = useMemo(
    () =>
      LEAD_SOURCES.map((source) => {
        const rows = allLeads.filter((lead) => lead.source === source.value);
        const won = rows.filter((lead) => lead.status === "converted").length;
        return {
          value: source.value,
          label: labelFor(LEAD_SOURCES, source.value, translate),
          count: rows.length,
          converted: won,
          rate: rows.length ? Math.round((won / rows.length) * 100) : 0,
        };
      }).sort((left, right) => right.count - left.count),
    [allLeads, translate]
  );

  const sourceOption = {
    color: CRM_CHART_COLORS,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { bottom: 0, textStyle: { color: "var(--muted-foreground)" } },
    grid: { left: 8, right: 12, top: 16, bottom: 46, containLabel: true },
    xAxis: {
      type: "category",
      data: sourceRows.map((row) => row.label),
      axisLabel: { color: "var(--muted-foreground)" },
      axisLine: { lineStyle: { color: "var(--border)" } },
    },
    yAxis: [
      {
        type: "value",
        minInterval: 1,
        axisLabel: { color: "var(--muted-foreground)" },
        splitLine: { lineStyle: { color: "var(--border)", opacity: 0.55 } },
      },
      {
        type: "value",
        max: 100,
        axisLabel: { color: "var(--muted-foreground)", formatter: "{value}%" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: translate("crm.leads.chart.volume", { ns: "starter" }, "Leads"),
        type: "bar",
        barMaxWidth: 38,
        data: sourceRows.map((row) => row.count),
        itemStyle: { color: "#2563eb", borderRadius: [6, 6, 0, 0] },
      },
      {
        name: translate("crm.leads.chart.conversion", { ns: "starter" }, "Conversion %"),
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 3 },
        itemStyle: { color: "#f59e0b" },
        data: sourceRows.map((row) => row.rate),
      },
    ],
  };

  const funnelRows = LEAD_STATUSES.map((status) => ({
    name: labelFor(LEAD_STATUSES, status.value, translate),
    value: allLeads.filter((lead) => lead.status === status.value).length,
  })).filter((row) => row.name !== labelFor(LEAD_STATUSES, "unqualified", translate));
  const funnelOption = {
    color: CRM_CHART_COLORS,
    tooltip: { trigger: "item" },
    series: [
      {
        type: "funnel",
        left: 12,
        right: 12,
        top: 10,
        bottom: 10,
        minSize: "24%",
        sort: "descending",
        gap: 3,
        label: { color: "var(--muted-foreground)", formatter: "{b}: {c}" },
        itemStyle: { borderColor: "var(--card)", borderWidth: 2 },
        data: funnelRows,
      },
    ],
  };

  const aiTasks = useLeadListTasks(translate);
  const columnCount = 3 + columnOptions.filter((column) => columnPrefs.isVisible(column.id)).length;

  return (
    <CrmAIContext
      id="crm-leads-list"
      title={translate("crm.ai.context.leads", { ns: "starter" }, "Lead list")}
      kind="record-list"
      getContext={() => ({
        resource: "crm_leads",
        filters: state,
        total: result.total,
        rows: visible.map((lead) => ({
          id: lead.id,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          status: lead.status,
          score: lead.score,
          grade: gradeFor(lead.score),
          owner: lead.owner?.nickname ?? null,
        })),
      })}
    >
    <ListView resource="crm_leads">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={translate("crm.leads.metrics.total", { ns: "starter" }, "Total leads")} value={summary.result.total ?? allLeads.length} icon={<Users className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.leads.metrics.qualified", { ns: "starter" }, "Qualified pipeline")} value={qualified} icon={<Target className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.leads.metrics.averageScore", { ns: "starter" }, "Average score")} value={`${averageScore}/100`} icon={<Gauge className="size-5" />} loading={summary.query.isLoading} />
        <MetricCard label={translate("crm.leads.metrics.conversion", { ns: "starter" }, "Conversion rate")} value={`${conversionRate}%`} icon={<Sparkles className="size-5" />} loading={summary.query.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard
          title={translate("crm.leads.chart.title", { ns: "starter" }, "Lead source performance")}
          description={translate(
            "crm.leads.chart.description",
            { ns: "starter" },
            "Volume by source with the share that ends up converted."
          )}
        >
          <ReactECharts option={sourceOption} opts={{ renderer: "svg" }} style={{ height: 280 }} />
        </ChartCard>
        <ChartCard
          title={translate("crm.leads.funnel.title", { ns: "starter" }, "Qualification funnel")}
          description={translate(
            "crm.leads.funnel.description",
            { ns: "starter" },
            "How many leads sit at each qualification step."
          )}
        >
          <ReactECharts option={funnelOption} opts={{ renderer: "svg" }} style={{ height: 280 }} />
        </ChartCard>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={summary.query.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.leads.kpi.all", { ns: "starter" }, "All leads"),
              value: summary.result.total ?? allLeads.length,
              active: !isDirty,
              onClick: reset,
            },
            {
              id: "hot",
              label: translate("crm.leads.kpi.hot", { ns: "starter" }, "A-grade"),
              value: hotLeads,
              tone: "success",
              active: state.grade === "A",
              onClick: () => replaceState({ grade: "A" }),
            },
            {
              id: "new",
              label: translate("crm.leads.kpi.new", { ns: "starter" }, "Never worked"),
              value: untouched,
              tone: "warning",
              active: state.status === "new",
              onClick: () => replaceState({ status: "new" }),
            },
            {
              id: "converted",
              label: translate("crm.leads.kpi.converted", { ns: "starter" }, "Converted"),
              value: converted,
              active: state.status === "converted",
              onClick: () => replaceState({ status: "converted" }),
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
                <ColumnSettingsMenu
                  columns={columnOptions}
                  isVisible={columnPrefs.isVisible}
                  toggle={columnPrefs.toggle}
                  density={columnPrefs.density}
                  setDensity={columnPrefs.setDensity}
                  reset={columnPrefs.reset}
                />
                <ExportCsvButton onExport={() => void exportCsv()} disabled={visible.length === 0} />
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
              placeholder={translate("crm.leads.search", { ns: "starter" }, "Search name, company or email")}
            />
            <ListFilterSelect
              value={state.status}
              onChange={(value) => setState({ status: value })}
              options={statusOptions}
              allLabel={translate("crm.leads.allStatuses", { ns: "starter" }, "All statuses")}
            />
            <ListFilterSelect
              value={state.source}
              onChange={(value) => setState({ source: value })}
              options={sourceOptions}
              allLabel={translate("crm.leads.allSources", { ns: "starter" }, "All sources")}
            />
            <ListFilterSelect
              value={state.grade}
              onChange={(value) => setState({ grade: value })}
              options={gradeOptions}
              allLabel={translate("crm.leads.allGrades", { ns: "starter" }, "All grades")}
            />
            <ListFilterSelect
              value={state.owner}
              onChange={(value) => setState({ owner: value })}
              options={ownerOptions}
              allLabel={translate("crm.common.allOwners", { ns: "starter" }, "All owners")}
            />
            <ListDateRange
              from={state.from}
              to={state.to}
              onFromChange={(value) => setState({ from: value })}
              onToChange={(value) => setState({ to: value })}
              label={translate("crm.leads.fields.createdAt", { ns: "starter" }, "Created")}
            />
          </ListToolbarContent>
        </ListToolbar>

        <BulkActionBar
          count={selection.selected.length}
          ids={selection.selected}
          actions={bulkActions}
          busy={bulk.running}
          onClear={selection.clear}
        />

        {query.isLoading ? (
          <TableSkeleton columns={columnCount} />
        ) : query.isError ? (
          <ListErrorState onRetry={() => void query.refetch()} />
        ) : (
          <>
            <div className={cn("overflow-x-auto", densityClass(columnPrefs.density))}>
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
                    <TableHead>
                      <div className="flex flex-col items-start">
                        <SortableHeader
                          field="name"
                          label={translate("crm.leads.fields.name", { ns: "starter" }, "Name")}
                          sorters={listSorters}
                        />
                        <SortableHeader
                          field="company"
                          label={translate("crm.leads.fields.company", { ns: "starter" }, "Company")}
                          sorters={listSorters}
                        />
                      </div>
                    </TableHead>
                    {columnPrefs.isVisible("grade") ? (
                      <TableHead className="w-16">{translate("crm.leads.fields.grade", { ns: "starter" }, "Grade")}</TableHead>
                    ) : null}
                    {columnPrefs.isVisible("source") ? (
                      <TableHead><SortableHeader field="source" label={translate("crm.leads.fields.source", { ns: "starter" }, "Source")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("status") ? (
                      <TableHead><SortableHeader field="status" label={translate("crm.leads.fields.status", { ns: "starter" }, "Status")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("score") ? (
                      <TableHead><SortableHeader field="score" label={translate("crm.leads.fields.score", { ns: "starter" }, "Score")} sorters={listSorters} /></TableHead>
                    ) : null}
                    {columnPrefs.isVisible("owner") ? (
                      <TableHead>{translate("crm.leads.fields.owner", { ns: "starter" }, "Owner")}</TableHead>
                    ) : null}
                    {columnPrefs.isVisible("createdAt") ? (
                      <TableHead><SortableHeader field="createdAt" label={translate("crm.leads.fields.createdAt", { ns: "starter" }, "Created")} sorters={listSorters} /></TableHead>
                    ) : null}
                    <TableHead className="w-28"><span className="sr-only">{translate("crm.common.actions", { ns: "starter" }, "Actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((lead) => (
                    <TableRow
                      key={String(lead.id)}
                      className="group cursor-pointer"
                      data-state={selection.isSelected(lead.id) ? "selected" : undefined}
                      onClick={() => openChild(`show/${lead.id}`)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <SelectCell
                          checked={selection.isSelected(lead.id)}
                          onToggle={() => selection.toggle(lead.id)}
                          label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">{lead.company}</div>
                      </TableCell>
                      {columnPrefs.isVisible("grade") ? (
                        <TableCell><LeadGradeBadge score={lead.score} /></TableCell>
                      ) : null}
                      {columnPrefs.isVisible("source") ? (
                        <TableCell>{labelFor(LEAD_SOURCES, lead.source, translate)}</TableCell>
                      ) : null}
                      {columnPrefs.isVisible("status") ? (
                        <TableCell
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <InlineEnumCell
                            resource="crm_leads"
                            id={lead.id}
                            field="status"
                            value={lead.status}
                            options={MANUAL_LEAD_STATUSES}
                            displayOptions={LEAD_STATUSES}
                            badge
                          />
                        </TableCell>
                      ) : null}
                      {columnPrefs.isVisible("score") ? (
                        <TableCell>
                          <div className="flex min-w-28 items-center gap-2">
                            <Progress value={Number(lead.score ?? 0)} className="w-20" />
                            <span className="text-xs font-semibold tabular-nums">{lead.score ?? 0}</span>
                          </div>
                        </TableCell>
                      ) : null}
                      {columnPrefs.isVisible("owner") ? (
                        <TableCell>{lead.owner?.nickname ?? "—"}</TableCell>
                      ) : null}
                      {columnPrefs.isVisible("createdAt") ? (
                        <TableCell className="whitespace-nowrap">{formatDate(lead.createdAt, locale)}</TableCell>
                      ) : null}
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`show/${lead.id}`); }}>
                            <Eye /><span className="sr-only">{translate("crm.leads.actions.view", { ns: "starter" }, "View lead")}</span>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(event) => { event.stopPropagation(); openChild(`edit/${lead.id}`); }}>
                            <Pencil /><span className="sr-only">{translate("crm.leads.actions.edit", { ns: "starter" }, "Edit lead")}</span>
                          </Button>
                          {lead.status !== "converted" && lead.status !== "unqualified" ? (
                            <Button variant="ghost" size="icon" title={translate("crm.leads.actions.convert", { ns: "starter" }, "Convert")} onClick={(event) => { event.stopPropagation(); openChild(`show/${lead.id}`); }}>
                              <ArrowRight /><span className="sr-only">{translate("crm.leads.actions.convert", { ns: "starter" }, "Convert")}</span>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {visible.length === 0 ? (
                <ListEmptyState
                  title={translate("crm.leads.empty", { ns: "starter" }, "No leads match the current filters.")}
                  description={translate(
                    "crm.leads.emptyDescription",
                    { ns: "starter" },
                    "Widen the filters, or capture a new lead to start working it."
                  )}
                  filtered={isDirty}
                  onClearFilters={reset}
                />
              ) : null}
            </div>
            <ListPagination
              currentPage={currentPage}
              pageSize={pageSize}
              total={result.total ?? visible.length}
              setCurrentPage={setCurrentPage}
              setPageSize={setPageSize}
            />
          </>
        )}
      </div>

      <BulkOwnerDialog
        open={ownerDialogOpen}
        onOpenChange={setOwnerDialogOpen}
        count={selection.selected.length}
        onAssign={(ownerId) =>
          void bulk.run(
            selection.selected,
            { owner_id: ownerId },
            translate("crm.bulk.assigned", { ns: "starter" }, "Owner updated")
          )
        }
      />
    </ListView>
    </CrmAIContext>
  );
}

export function LeadShow() {
  const { id } = useParams<{ id: string }>();
  const translate = useTranslate();
  const locale = useLocale();
  const closeTo = useContextualCloseTo();
  const [convertOpen, setConvertOpen] = useState(false);
  const aiTasks = useLeadDetailTasks(translate);
  const { result: lead, query } = useOne<LeadRecord>({
    resource: "crm_leads",
    id,
    meta: { appends: ["owner", "createdBy", "updatedBy"] },
    queryOptions: { enabled: Boolean(id), retry: false },
  });
  useTrackRecentRecord("lead", lead?.id, lead?.name);

  const factors = useMemo(() => scoreFactors(lead, translate), [lead, translate]);
  const modelled = modelledScore(factors);
  const grade = gradeFor(lead?.score);
  const convertible =
    Boolean(lead) && lead?.status !== "converted" && lead?.status !== "unqualified";

  return (
    <CrmAIContext
      id="crm-lead-detail"
      title={translate("crm.ai.context.lead", { ns: "starter" }, "Lead detail")}
      getContext={() => ({
        resource: "crm_leads",
        record: lead
          ? {
              id: lead.id,
              name: lead.name,
              company: lead.company,
              email: lead.email,
              phone: lead.phone,
              source: lead.source,
              status: lead.status,
              score: lead.score,
              grade,
              owner: lead.owner?.nickname ?? null,
              createdAt: lead.createdAt,
            }
          : null,
        scoring: factors.map((factor) => ({
          factor: factor.label,
          points: factor.points,
          max: factor.max,
        })),
      })}
    >
      <RouteDrawer
      className={DRAWER_WIDE}
        title={lead?.name ?? translate("crm.leads.detail.title", { ns: "starter" }, "Lead details")}
        description={translate("crm.leads.detail.description", { ns: "starter" }, "Qualification signals, contact details and conversion readiness.")}
        closeLabel={translate("crm.common.close", { ns: "starter" }, "Close")}
        closeTo={closeTo}
        actions={
          <div className="flex items-center gap-2">
            <RecordPager
              kind="lead"
              id={id}
              buildPath={(next) => `../show/${next}`}
            />
            <CrmAIShortcut tasks={aiTasks} />
            <CopyLinkButton />
            {convertible ? (
              <Button onClick={() => setConvertOpen(true)}>
                <Sparkles />
                {translate("crm.leads.actions.convert", { ns: "starter" }, "Convert")}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {query.isLoading ? (
            <TableSkeleton columns={2} rows={6} />
          ) : query.isError ? (
            <ListErrorState onRetry={() => void query.refetch()} />
          ) : lead ? (
            <div className="space-y-7">
              <div className="rounded-xl border bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{translate("crm.leads.fields.score", { ns: "starter" }, "Lead score")}</p>
                    <p className="mt-1 flex items-baseline gap-2 text-3xl font-semibold tabular-nums">
                      {lead.score ?? 0}
                      <span className="text-base text-muted-foreground">/100</span>
                      <span className={cn("rounded-md px-2 py-0.5 text-sm font-semibold", gradeClass(grade))}>
                        {translate("crm.leads.gradeLabel", { ns: "starter" }, "Grade")} {grade}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <EnumBadge value={lead.status} label={labelFor(LEAD_STATUSES, lead.status, translate)} />
                    <RelativeTime value={lead.updatedAt ?? lead.createdAt} />
                  </div>
                </div>
                <Progress value={Number(lead.score ?? 0)} className="mt-4" />
              </div>

              <DetailItems title={translate("crm.leads.detail.profile", { ns: "starter" }, "Lead profile")} items={[
                [translate("crm.leads.fields.company", { ns: "starter" }, "Company"), <span key="company" className="inline-flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" />{lead.company || "—"}</span>],
                [translate("crm.leads.fields.owner", { ns: "starter" }, "Owner"), lead.owner?.nickname || "—"],
                [translate("crm.leads.fields.email", { ns: "starter" }, "Email"), <span key="email" className="inline-flex items-center gap-2"><Mail className="size-4 text-muted-foreground" />{lead.email || "—"}</span>],
                [translate("crm.leads.fields.phone", { ns: "starter" }, "Phone"), <span key="phone" className="inline-flex items-center gap-2"><Phone className="size-4 text-muted-foreground" />{lead.phone || "—"}</span>],
                [translate("crm.leads.fields.source", { ns: "starter" }, "Source"), labelFor(LEAD_SOURCES, lead.source, translate)],
                [translate("crm.leads.fields.createdAt", { ns: "starter" }, "Created"), formatDate(lead.createdAt, locale)],
              ]} />

              <DrawerSection
                title={translate("crm.leads.scoring.title", { ns: "starter" }, "Score breakdown")}
                action={
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {translate("crm.leads.scoring.modelled", { ns: "starter" }, "Model")}: {modelled}/100
                  </span>
                }
              >
                <div className="space-y-2 rounded-lg border p-4">
                  {factors.map((factor) => (
                    <div key={factor.key} className="flex items-center gap-3">
                      <span className="w-48 shrink-0 text-sm">{factor.label}</span>
                      <Progress value={(factor.points / factor.max) * 100} className="h-2 flex-1" />
                      <span
                        className={cn(
                          "w-14 shrink-0 text-right text-xs font-semibold tabular-nums",
                          factor.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )}
                      >
                        {factor.points}/{factor.max}
                      </span>
                    </div>
                  ))}
                  <p className="pt-2 text-xs leading-5 text-muted-foreground">
                    {translate(
                      "crm.leads.scoring.description",
                      { ns: "starter" },
                      "Completeness of the record is combined with source quality and qualification progress. The stored score is refreshed on conversion."
                    )}
                  </p>
                </div>
              </DrawerSection>

              <DrawerSection title={translate("crm.leads.readiness.title", { ns: "starter" }, "Conversion readiness")}>
                <ul className="space-y-2 rounded-lg border p-4 text-sm">
                  {[
                    {
                      label: translate("crm.leads.readiness.company", { ns: "starter" }, "Company name captured"),
                      met: Boolean(lead.company),
                    },
                    {
                      label: translate("crm.leads.readiness.contact", { ns: "starter" }, "Reachable by email or phone"),
                      met: Boolean(lead.email || lead.phone),
                    },
                    {
                      label: translate("crm.leads.readiness.owner", { ns: "starter" }, "Owner assigned"),
                      met: Boolean(lead.owner_id),
                    },
                    {
                      label: translate("crm.leads.readiness.qualified", { ns: "starter" }, "Qualified or in progress"),
                      met: ["qualified", "working", "converted"].includes(lead.status ?? ""),
                    },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-2">
                      {item.met ? (
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="size-4 text-muted-foreground" />
                      )}
                      <span className={item.met ? "" : "text-muted-foreground"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>

              <AuditTrail record={lead} locale={locale} />
            </div>
          ) : null}
        </div>
      </RouteDrawer>

      <LeadConvertDialog
        lead={lead}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConverted={() => query.refetch()}
      />
    </CrmAIContext>
  );
}
