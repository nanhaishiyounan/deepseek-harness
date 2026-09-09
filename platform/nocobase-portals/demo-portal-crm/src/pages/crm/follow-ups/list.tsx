import { useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckCircle2, Pencil, RotateCcw, Trash2, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ListView } from "@/components/resources/views/list-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FOLLOW_UP_STATUSES, labelFor } from "../constants";
import { csvTimestamp, downloadCsv, type CsvColumn } from "../csv";
import { useCrmIdentity } from "../identity";
import { InlineDateCell, InlineEnumCell } from "../inline-edit";
import {
  BulkActionBar,
  BulkOwnerDialog,
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
  dateRangeFilter,
  searchFilter,
  useDebouncedValue,
  useResetPageOnFilterChange,
} from "../list-controls";
import { useCustomerOptions, useOwnerOptions } from "../pickers";
import { useUrlState } from "../url-state";
import type { FollowUpRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";

export function FollowUpsLayout() {
  return (
    <CanAccess resource="crm_follow_ups" action="list" fallback={<AccessDenied />}>
      <FollowUpList />
    </CanAccess>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const FOLLOW_UP_FILTER_DEFAULTS = {
  q: "",
  status: "all",
  customer: "all",
  owner: "all",
  from: "",
  to: "",
};

type FollowUpFilterState = typeof FOLLOW_UP_FILTER_DEFAULTS;

function FollowUpList() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const openChild = useOpenContextualChild();
  const { options: customerOptions } = useCustomerOptions();
  const { options: ownerOptions } = useOwnerOptions();
  const { mutate: updateFollowUp } = useUpdate<FollowUpRecord>();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<FollowUpFilterState>(FOLLOW_UP_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const bulk = useBulkMutation("crm_follow_ups");

  // The top toolbar is the single filter entry point; column headers only sort.
  const permanentFilters = useMemo(
    () => [
      ...searchFilter(["subject", "notes"], debouncedSearch),
      ...(state.status === "all"
        ? []
        : [{ field: "status", operator: "eq" as const, value: state.status }]),
      ...(state.customer === "all"
        ? []
        : [{ field: "customer_id", operator: "eq" as const, value: state.customer }]),
      ...(state.owner === "all"
        ? []
        : [{ field: "ownerId", operator: "eq" as const, value: state.owner }]),
      ...dateRangeFilter("due_date", state.from, state.to),
    ],
    [debouncedSearch, state.status, state.customer, state.owner, state.from, state.to]
  );

  const statusOptions = useMemo(
    () =>
      FOLLOW_UP_STATUSES.map((status) => ({
        value: status.value,
        label: labelFor(FOLLOW_UP_STATUSES, status.value, translate),
      })),
    [translate]
  );

  const columnOptions = useMemo(
    () => [
      { id: "due_date", label: translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due"), locked: true },
      { id: "subject", label: translate("crm.followUps.fields.subject", { ns: "starter" }, "Subject") },
      { id: "customer.id", label: translate("crm.followUps.fields.customer", { ns: "starter" }, "Customer") },
      { id: "ownerName", label: translate("crm.followUps.fields.owner", { ns: "starter" }, "Owner") },
      { id: "status", label: translate("crm.followUps.fields.status", { ns: "starter" }, "Status") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("follow-ups", columnOptions);

  const [pageIds, setPageIds] = useState<Array<string | number>>([]);
  const selection = useRowSelection(pageIds);

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<FollowUpRecord>();
    const today = todayIso();
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
      columnHelper.accessor("due_date", {
        id: "due_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row, getValue }) => (
          <InlineDateCell
            resource="crm_follow_ups"
            id={row.original.id}
            field="due_date"
            value={getValue()}
            isAlert={(nextValue) =>
              row.original.status !== "done" &&
              Boolean(nextValue) &&
              String(nextValue) < today
            }
          />
        ),
      }),
      columnHelper.accessor("subject", {
        id: "subject",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.followUps.fields.subject", { ns: "starter" }, "Subject")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor((record) => record.customer?.company_name, {
        id: "customer.id",
        header: translate("crm.followUps.fields.customer", { ns: "starter" }, "Customer"),
        enableSorting: false,
        cell: ({ row }) => row.original.customer?.company_name || "—",
      }),
      columnHelper.accessor((record) => record.owner?.nickname, {
        id: "ownerName",
        header: translate("crm.followUps.fields.owner", { ns: "starter" }, "Owner"),
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.followUps.fields.status", { ns: "starter" }, "Status")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row, getValue }) => (
          <InlineEnumCell
            resource="crm_follow_ups"
            id={row.original.id}
            field="status"
            value={getValue() ?? "pending"}
            options={FOLLOW_UP_STATUSES}
            badge
          />
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: translate("crm.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 128,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.status !== "done" ? (
              <Button
                variant="ghost"
                size="icon"
                title={translate("crm.followUps.actions.markDone", { ns: "starter" }, "Mark done")}
                onClick={() =>
                  updateFollowUp({
                    resource: "crm_follow_ups",
                    id: row.original.id,
                    values: { status: "done" },
                  })
                }
              >
                <CheckCircle2 />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                title={translate("crm.followUps.actions.reopen", { ns: "starter" }, "Re-open")}
                onClick={() =>
                  updateFollowUp({
                    resource: "crm_follow_ups",
                    id: row.original.id,
                    values: { status: "pending" },
                  })
                }
              >
                <RotateCcw />
              </Button>
            )}
            <EditButton
              resource="crm_follow_ups"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="crm_follow_ups"
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
  }, [openChild, selection, translate, updateFollowUp]);

  const table = useTable<FollowUpRecord>({
    columns,
    state: { columnVisibility: columnPrefs.visibility },
    refineCoreProps: {
      resource: "crm_follow_ups",
      syncWithLocation: false,
      meta: { appends: ["customer", "owner"] },
      pagination: { currentPage: 1, pageSize: DEFAULT_PAGE_SIZE },
      filters: { permanent: permanentFilters },
      sorters: { initial: [{ field: "due_date", order: "asc" }] },
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

  const today = todayIso();
  const overdueRows = rows.filter(
    (record) => record.status !== "done" && (record.due_date ?? "") < today
  );

  const presets = useMemo<ViewPreset<FollowUpFilterState>[]>(
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
              state: { owner: identity.userId, status: "pending" },
            },
          ]
        : []),
      {
        id: "overdue",
        name: translate("crm.followUps.views.overdue", { ns: "starter" }, "Overdue"),
        state: { status: "pending", to: today },
      },
      {
        id: "week",
        name: translate("crm.followUps.views.week", { ns: "starter" }, "Due this week"),
        state: { status: "pending", from: today, to: inDays(7) },
      },
      {
        id: "open",
        name: translate("crm.followUps.views.open", { ns: "starter" }, "All open"),
        state: { status: "pending" },
      },
    ],
    [identity.userId, today, translate]
  );
  const savedViews = useSavedViews<FollowUpFilterState>("follow-ups");
  const activeView = useActiveViewName(
    state,
    FOLLOW_UP_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<FollowUpRecord>[]>(
    () => [
      { header: translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due"), value: (record) => record.due_date ?? "" },
      { header: translate("crm.followUps.fields.subject", { ns: "starter" }, "Subject"), value: (record) => record.subject },
      { header: translate("crm.followUps.fields.customer", { ns: "starter" }, "Customer"), value: (record) => record.customer?.company_name },
      { header: translate("crm.followUps.fields.owner", { ns: "starter" }, "Owner"), value: (record) => record.owner?.nickname },
      { header: translate("crm.followUps.fields.status", { ns: "starter" }, "Status"), value: (record) => labelFor(FOLLOW_UP_STATUSES, record.status ?? "pending", translate) },
      { header: translate("crm.followUps.fields.notes", { ns: "starter" }, "Notes"), value: (record) => record.notes },
    ],
    [translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "done",
          label: translate("crm.followUps.bulk.done", { ns: "starter" }, "Mark done"),
          icon: <CheckCircle2 className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "done" },
              translate("crm.followUps.bulk.completed", { ns: "starter" }, "Follow-ups completed")
            ),
        },
        {
          id: "snooze",
          label: translate("crm.followUps.bulk.snooze", { ns: "starter" }, "Push out one week"),
          icon: <RotateCcw className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { due_date: inDays(7) },
              translate("crm.followUps.bulk.snoozed", { ns: "starter" }, "Due dates moved")
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

  return (
    <ListView resource="crm_follow_ups">
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={table.refineCore.tableQuery.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.followUps.kpi.all", { ns: "starter" }, "In view"),
              value: total,
              active: !isDirty,
              onClick: reset,
            },
            {
              id: "overdue",
              label: translate("crm.followUps.kpi.overdue", { ns: "starter" }, "Overdue"),
              value: overdueRows.length,
              tone: overdueRows.length > 0 ? "danger" : "default",
              active: state.status === "pending" && state.to === today,
              onClick: () => replaceState({ status: "pending", to: today }),
            },
            {
              id: "week",
              label: translate("crm.followUps.kpi.week", { ns: "starter" }, "Due this week"),
              value: rows.filter(
                (record) =>
                  record.status !== "done" &&
                  (record.due_date ?? "") >= today &&
                  (record.due_date ?? "") <= inDays(7)
              ).length,
              tone: "warning",
              active: state.from === today && state.to === inDays(7),
              onClick: () =>
                replaceState({ status: "pending", from: today, to: inDays(7) }),
            },
            {
              id: "done",
              label: translate("crm.followUps.kpi.done", { ns: "starter" }, "Completed"),
              value: rows.filter((record) => record.status === "done").length,
              tone: "success",
              active: state.status === "done",
              onClick: () => replaceState({ status: "done" }),
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
                <ExportCsvButton
                  disabled={rows.length === 0}
                  onExport={() =>
                    downloadCsv(`crm-follow-ups-${csvTimestamp()}.csv`, csvColumns, rows)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.followUps.search", { ns: "starter" }, "Search subject or notes")}
            />
            <ListFilterSelect
              value={state.status}
              onChange={(value) => setState({ status: value })}
              options={statusOptions}
              allLabel={translate("crm.followUps.allStatuses", { ns: "starter" }, "All statuses")}
            />
            <ListFilterSelect
              value={state.customer}
              onChange={(value) => setState({ customer: value })}
              options={customerOptions}
              allLabel={translate("crm.common.allCustomers", { ns: "starter" }, "All customers")}
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
              label={translate("crm.followUps.fields.dueDate", { ns: "starter" }, "Due")}
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
  );
}
