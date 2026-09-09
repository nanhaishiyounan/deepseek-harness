import { useTranslate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ListView } from "@/components/resources/views/list-view";
import { cn } from "@/lib/utils";
import { ACTIVITY_TYPES, formatDateTime, labelFor } from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import { InlineEnumCell } from "../inline-edit";
import {
  BulkActionBar,
  ColumnSettingsMenu,
  ExportCsvButton,
  KpiStrip,
  SavedViewsMenu,
  SelectCell,
  densityClass,
  useActiveViewName,
  useBulkMutation,
  useColumnPreferences,
  useRowSelection,
  useSavedViews,
  type BulkAction,
  type ViewPreset,
} from "../list-toolkit";
import {
  DEFAULT_PAGE_SIZE,
  ListDateRange,
  ListFilterSelect,
  ListSearchInput,
  ListToolbar,
  ListToolbarContent,
  dateTimeRangeFilter,
  searchFilter,
  useDebouncedValue,
  useResetPageOnFilterChange,
} from "../list-controls";
import { useCustomerOptions } from "../pickers";
import { useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { ActivityRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";

export function ActivitiesLayout() {
  return (
    <CanAccess resource="crm_activities" action="list" fallback={<AccessDenied />}>
      <ActivityList />
    </CanAccess>
  );
}

const ACTIVITY_FILTER_DEFAULTS = {
  q: "",
  type: "all",
  customer: "all",
  from: "",
  to: "",
};

type ActivityFilterState = typeof ACTIVITY_FILTER_DEFAULTS;

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

function ActivityList() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const openChild = useOpenContextualChild();
  const locale = useLocale();
  const { options: customerOptions } = useCustomerOptions();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<ActivityFilterState>(ACTIVITY_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const bulk = useBulkMutation("crm_activities");

  // The top toolbar is the single filter entry point; column headers only sort.
  const permanentFilters = useMemo(
    () => [
      ...searchFilter(["subject", "notes"], debouncedSearch),
      ...(state.type === "all"
        ? []
        : [{ field: "type", operator: "eq" as const, value: state.type }]),
      ...(state.customer === "all"
        ? []
        : [{ field: "customer_id", operator: "eq" as const, value: state.customer }]),
      ...dateTimeRangeFilter("date", state.from, state.to),
    ],
    [debouncedSearch, state.type, state.customer, state.from, state.to]
  );

  const typeOptions = useMemo(
    () =>
      ACTIVITY_TYPES.map((type) => ({
        value: type.value,
        label: labelFor(ACTIVITY_TYPES, type.value, translate),
      })),
    [translate]
  );

  const columnOptions = useMemo(
    () => [
      { id: "date", label: translate("crm.activities.fields.date", { ns: "starter" }, "Date"), locked: true },
      { id: "type", label: translate("crm.activities.fields.type", { ns: "starter" }, "Type") },
      { id: "subject", label: translate("crm.activities.fields.subject", { ns: "starter" }, "Subject") },
      { id: "customer.id", label: translate("crm.activities.fields.customer", { ns: "starter" }, "Customer") },
      { id: "contactName", label: translate("crm.activities.fields.contact", { ns: "starter" }, "Contact") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("activities", columnOptions);

  const [pageIds, setPageIds] = useState<Array<string | number>>([]);
  const selection = useRowSelection(pageIds);

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<ActivityRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        header: () => (
          <SelectCell
            checked={selection.allSelected}
            onToggle={selection.toggleAll}
            label={translate("crm.bulk.selectAll", { ns: "starter" }, "Select all rows")}
          />
        ),
        cell: ({ row }) => (
          <SelectCell
            checked={selection.isSelected(row.original.id)}
            onToggle={() => selection.toggle(row.original.id)}
            label={translate("crm.bulk.selectRow", { ns: "starter" }, "Select row")}
          />
        ),
      }),
      columnHelper.accessor("date", {
        id: "date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("crm.activities.fields.date", { ns: "starter" }, "Date")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">
            {formatDateTime(getValue(), locale)}
          </span>
        ),
      }),
      columnHelper.accessor("type", {
        id: "type",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.activities.fields.type", { ns: "starter" }, "Type")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row, getValue }) => (
          <InlineEnumCell
            resource="crm_activities"
            id={row.original.id}
            field="type"
            value={getValue() ?? "call"}
            options={ACTIVITY_TYPES}
            badge
          />
        ),
      }),
      columnHelper.accessor("subject", {
        id: "subject",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.activities.fields.subject", { ns: "starter" }, "Subject")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor((record) => record.customer?.company_name, {
        id: "customer.id",
        header: translate("crm.activities.fields.customer", { ns: "starter" }, "Customer"),
        enableSorting: false,
        cell: ({ row }) => row.original.customer?.company_name || "—",
      }),
      columnHelper.accessor((record) => record.contact?.name, {
        id: "contactName",
        header: translate("crm.activities.fields.contact", { ns: "starter" }, "Contact"),
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.display({
        id: "actions",
        header: translate("crm.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <EditButton
              resource="crm_activities"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="crm_activities"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
            </DeleteButton>
          </div>
        ),
      }),
    ];
  }, [locale, openChild, selection, translate]);

  const table = useTable<ActivityRecord>({
    columns,
    state: { columnVisibility: columnPrefs.visibility },
    refineCoreProps: {
      resource: "crm_activities",
      syncWithLocation: false,
      meta: { appends: ["customer", "contact"] },
      pagination: { currentPage: 1, pageSize: DEFAULT_PAGE_SIZE },
      filters: { permanent: permanentFilters },
      sorters: { initial: [{ field: "date", order: "desc" }] },
    },
  });

  useResetPageOnFilterChange(
    `${debouncedSearch}|${fingerprint}`,
    table.refineCore.setCurrentPage
  );

  const rows = table.refineCore.tableQuery.data?.data ?? [];
  const total = table.refineCore.tableQuery.data?.total ?? rows.length;
  const currentIds = rows.map((record) => record.id);
  if (
    currentIds.length !== pageIds.length ||
    currentIds.some((id, index) => String(id) !== String(pageIds[index]))
  ) {
    setPageIds(currentIds);
  }

  const presets = useMemo<ViewPreset<ActivityFilterState>[]>(
    () => [
      {
        id: "week",
        name: translate("crm.activities.views.week", { ns: "starter" }, "Logged this week"),
        state: { from: daysAgo(7), to: todayIso() },
      },
      {
        id: "meetings",
        name: translate("crm.activities.views.meetings", { ns: "starter" }, "Meetings only"),
        state: { type: "meeting" },
      },
      {
        id: "calls",
        name: translate("crm.activities.views.calls", { ns: "starter" }, "Calls only"),
        state: { type: "call" },
      },
    ],
    [translate]
  );
  const savedViews = useSavedViews<ActivityFilterState>("activities");
  const activeView = useActiveViewName(
    state,
    ACTIVITY_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<ActivityRecord>[]>(
    () => [
      { header: translate("crm.activities.fields.date", { ns: "starter" }, "Date"), value: (record) => record.date ?? "" },
      { header: translate("crm.activities.fields.type", { ns: "starter" }, "Type"), value: (record) => labelFor(ACTIVITY_TYPES, record.type ?? "call", translate) },
      { header: translate("crm.activities.fields.subject", { ns: "starter" }, "Subject"), value: (record) => record.subject },
      { header: translate("crm.activities.fields.customer", { ns: "starter" }, "Customer"), value: (record) => record.customer?.company_name },
      { header: translate("crm.activities.fields.contact", { ns: "starter" }, "Contact"), value: (record) => record.contact?.name },
      { header: translate("crm.activities.fields.notes", { ns: "starter" }, "Notes"), value: (record) => record.notes },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "call",
          label: translate("crm.activities.bulk.markCall", { ns: "starter" }, "Set type: call"),
          onRun: (ids) =>
            bulk.run(
              ids,
              { type: "call" },
              translate("crm.activities.bulk.updated", { ns: "starter" }, "Activities updated")
            ),
        },
        {
          id: "meeting",
          label: translate("crm.activities.bulk.markMeeting", { ns: "starter" }, "Set type: meeting"),
          onRun: (ids) =>
            bulk.run(
              ids,
              { type: "meeting" },
              translate("crm.activities.bulk.updated", { ns: "starter" }, "Activities updated")
            ),
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

  return (
    <ListView resource="crm_activities">
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={table.refineCore.tableQuery.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.activities.kpi.all", { ns: "starter" }, "In view"),
              value: total,
              active: !isDirty,
              onClick: reset,
            },
            ...ACTIVITY_TYPES.map((type) => ({
              id: type.value,
              label: labelFor(ACTIVITY_TYPES, type.value, translate),
              value: rows.filter((record) => record.type === type.value).length,
              active: state.type === type.value,
              onClick: () => replaceState({ type: type.value }),
            })),
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
                <ExportCsvButton
                  disabled={rows.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-activities-${csvTimestamp()}.csv`, csvColumns, rows)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.activities.search", { ns: "starter" }, "Search subject or notes")}
            />
            <ListFilterSelect
              value={state.type}
              onChange={(value) => setState({ type: value })}
              options={typeOptions}
              allLabel={translate("crm.activities.allTypes", { ns: "starter" }, "All types")}
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
              label={translate("crm.activities.fields.date", { ns: "starter" }, "Date")}
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
      </div>
      <div className={cn("flex flex-1 flex-col", densityClass(columnPrefs.density))}>
        <DataTable
          table={table}
          onRowClick={(record) => openChild(`show/${record.id}`)}
        />
      </div>
    </ListView>
  );
}
