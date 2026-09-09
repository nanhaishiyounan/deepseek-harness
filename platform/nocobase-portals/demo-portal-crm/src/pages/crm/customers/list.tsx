import { useTranslate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Eye, Pencil, PowerOff, Trash2, UserCog, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_STATUSES,
  INDUSTRIES,
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
import { useOwnerOptions } from "../pickers";
import { useRecordCursorSource } from "../record-cursor";
import { EnumBadge, useLocale } from "../shared";
import { useUrlState } from "../url-state";
import type { CustomerRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";

const CUSTOMER_FILTER_DEFAULTS = {
  q: "",
  status: "all",
  industry: "all",
  owner: "all",
  from: "",
  to: "",
};

type CustomerFilterState = typeof CUSTOMER_FILTER_DEFAULTS;

export function CustomersLayout() {
  return (
    <CanAccess resource="crm_customers" action="list" fallback={<AccessDenied />}>
      <CustomerList />
    </CanAccess>
  );
}

function CustomerList() {
  const translate = useTranslate();
  const identity = useCrmIdentity();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const { options: ownerOptions } = useOwnerOptions();
  const { state, setState, replaceState, reset, fingerprint, isDirty } =
    useUrlState<CustomerFilterState>(CUSTOMER_FILTER_DEFAULTS);
  const debouncedSearch = useDebouncedValue(state.q);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const bulk = useBulkMutation("crm_customers");

  // The top toolbar is the single filter entry point; column headers only sort.
  const permanentFilters = useMemo(
    () => [
      ...searchFilter(["company_name", "phone", "website"], debouncedSearch),
      ...(state.status === "all"
        ? []
        : [{ field: "status", operator: "eq" as const, value: state.status }]),
      ...(state.industry === "all"
        ? []
        : [{ field: "industry", operator: "eq" as const, value: state.industry }]),
      ...(state.owner === "all"
        ? []
        : [{ field: "ownerId", operator: "eq" as const, value: state.owner }]),
      ...dateTimeRangeFilter("createdAt", state.from, state.to),
    ],
    [debouncedSearch, state.status, state.industry, state.owner, state.from, state.to]
  );

  const industryOptions = useMemo(
    () =>
      INDUSTRIES.map((industry) => ({
        value: industry.value,
        label: labelFor(INDUSTRIES, industry.value, translate),
      })),
    [translate]
  );
  const statusOptions = useMemo(
    () =>
      CUSTOMER_STATUSES.map((status) => ({
        value: status.value,
        label: labelFor(CUSTOMER_STATUSES, status.value, translate),
      })),
    [translate]
  );

  const columnOptions = useMemo(
    () => [
      { id: "company_name", label: translate("crm.customers.fields.companyName", { ns: "starter" }, "Company name"), locked: true },
      { id: "industry", label: translate("crm.customers.fields.industry", { ns: "starter" }, "Industry") },
      { id: "status", label: translate("crm.customers.fields.status", { ns: "starter" }, "Status") },
      { id: "phone", label: translate("crm.customers.fields.phone", { ns: "starter" }, "Phone") },
      { id: "ownerName", label: translate("crm.customers.fields.owner", { ns: "starter" }, "Account owner") },
      { id: "createdAt", label: translate("crm.customers.fields.createdAt", { ns: "starter" }, "Customer since") },
    ],
    [translate]
  );
  const columnPrefs = useColumnPreferences("customers", columnOptions);

  const [pageIds, setPageIds] = useState<Array<string | number>>([]);
  const selection = useRowSelection(pageIds);

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<CustomerRecord>();
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
      columnHelper.accessor("company_name", {
        id: "company_name",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("crm.customers.fields.companyName", { ns: "starter" }, "Company name")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("industry", {
        id: "industry",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.customers.fields.industry", { ns: "starter" }, "Industry")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? (
            <EnumBadge value={value} label={labelFor(INDUSTRIES, value, translate)} />
          ) : (
            "—"
          );
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.customers.fields.status", { ns: "starter" }, "Status")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row, getValue }) => (
          <InlineEnumCell
            resource="crm_customers"
            id={row.original.id}
            field="status"
            value={getValue() ?? "active"}
            options={CUSTOMER_STATUSES}
            badge
          />
        ),
      }),
      columnHelper.accessor("phone", {
        id: "phone",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("crm.customers.fields.phone", { ns: "starter" }, "Phone")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor((record) => record.owner?.nickname, {
        id: "ownerName",
        header: translate("crm.customers.fields.owner", { ns: "starter" }, "Account owner"),
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("createdAt", {
        id: "createdAt",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("crm.customers.fields.createdAt", { ns: "starter" }, "Customer since")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue(), locale)}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: translate("crm.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="crm_customers"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="crm_customers"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="crm_customers"
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

  const table = useTable<CustomerRecord>({
    columns,
    state: { columnVisibility: columnPrefs.visibility },
    refineCoreProps: {
      resource: "crm_customers",
      syncWithLocation: false,
      meta: { appends: ["owner"] },
      pagination: { currentPage: 1, pageSize: DEFAULT_PAGE_SIZE },
      filters: { permanent: permanentFilters },
      sorters: { initial: [{ field: "company_name", order: "asc" }] },
    },
  });

  useResetPageOnFilterChange(
    `${debouncedSearch}|${fingerprint}`,
    table.refineCore.setCurrentPage
  );

  const rows = table.refineCore.tableQuery.data?.data ?? [];
  useRecordCursorSource("customer", rows.map((row) => row.id));
  const total = table.refineCore.tableQuery.data?.total ?? rows.length;
  const currentIds = rows.map((record) => record.id);
  // Keeps the selection scoped to what is on screen without re-rendering the
  // column definitions on every data change.
  if (
    currentIds.length !== pageIds.length ||
    currentIds.some((id, index) => String(id) !== String(pageIds[index]))
  ) {
    setPageIds(currentIds);
  }

  const presets = useMemo<ViewPreset<CustomerFilterState>[]>(
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
        id: "active",
        name: translate("crm.customers.views.active", { ns: "starter" }, "Active accounts"),
        state: { status: "active" },
      },
      {
        id: "inactive",
        name: translate("crm.customers.views.inactive", { ns: "starter" }, "Dormant accounts"),
        state: { status: "inactive" },
      },
      {
        id: "design",
        name: translate("crm.customers.views.design", { ns: "starter" }, "Design studios"),
        state: { industry: "design" },
      },
    ],
    [identity.userId, translate]
  );
  const savedViews = useSavedViews<CustomerFilterState>("customers");
  const activeView = useActiveViewName(
    state,
    CUSTOMER_FILTER_DEFAULTS,
    presets,
    savedViews.views
  );

  const csvColumns = useMemo<CsvColumn<CustomerRecord>[]>(
    () => [
      { header: translate("crm.customers.fields.companyName", { ns: "starter" }, "Company name"), value: (record) => record.company_name },
      { header: translate("crm.customers.fields.industry", { ns: "starter" }, "Industry"), value: (record) => labelFor(INDUSTRIES, record.industry, translate) },
      { header: translate("crm.customers.fields.status", { ns: "starter" }, "Status"), value: (record) => labelFor(CUSTOMER_STATUSES, record.status ?? "active", translate) },
      { header: translate("crm.customers.fields.phone", { ns: "starter" }, "Phone"), value: (record) => record.phone },
      { header: translate("crm.customers.fields.website", { ns: "starter" }, "Website"), value: (record) => record.website },
      { header: translate("crm.customers.fields.owner", { ns: "starter" }, "Account owner"), value: (record) => record.owner?.nickname },
      { header: translate("crm.customers.fields.createdAt", { ns: "starter" }, "Customer since"), value: (record) => formatDate(record.createdAt, locale) },
    ],
    [locale, translate]
  );

  const bulkActions = useMemo<BulkAction[]>(
    () => {
      const actions: BulkAction[] = [
        {
          id: "activate",
          label: translate("crm.customers.bulk.activate", { ns: "starter" }, "Mark active"),
          icon: <Zap className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "active" },
              translate("crm.customers.bulk.activated", { ns: "starter" }, "Accounts marked active")
            ),
        },
        {
          id: "deactivate",
          label: translate("crm.customers.bulk.deactivate", { ns: "starter" }, "Mark inactive"),
          icon: <PowerOff className="size-4" />,
          onRun: (ids) =>
            bulk.run(
              ids,
              { status: "inactive" },
              translate("crm.customers.bulk.deactivated", { ns: "starter" }, "Accounts marked inactive")
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
    <ListView resource="crm_customers">
      <div className="rounded-xl border bg-card shadow-sm">
        <KpiStrip
          loading={table.refineCore.tableQuery.isLoading}
          chips={[
            {
              id: "all",
              label: translate("crm.customers.kpi.all", { ns: "starter" }, "Accounts in view"),
              value: total,
              active: !isDirty,
              onClick: reset,
            },
            {
              id: "active",
              label: translate("crm.customers.kpi.active", { ns: "starter" }, "Active"),
              value: rows.filter((record) => (record.status ?? "active") === "active").length,
              tone: "success",
              active: state.status === "active",
              onClick: () => replaceState({ status: "active" }),
            },
            {
              id: "inactive",
              label: translate("crm.customers.kpi.inactive", { ns: "starter" }, "Inactive"),
              value: rows.filter((record) => record.status === "inactive").length,
              tone: "warning",
              active: state.status === "inactive",
              onClick: () => replaceState({ status: "inactive" }),
            },
            {
              id: "unassigned",
              label: translate("crm.customers.kpi.unassigned", { ns: "starter" }, "No owner"),
              value: rows.filter((record) => !record.ownerId).length,
              tone: "danger",
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
                    downloadCsv(`crm-customers-${csvTimestamp()}.csv`, csvColumns, rows)
                  }
                />
              </div>
            }
          >
            <ListSearchInput
              value={state.q}
              onChange={(value) => setState({ q: value })}
              placeholder={translate("crm.customers.search", { ns: "starter" }, "Search company, phone or website")}
            />
            <ListFilterSelect
              value={state.status}
              onChange={(value) => setState({ status: value })}
              options={statusOptions}
              allLabel={translate("crm.customers.allStatuses", { ns: "starter" }, "All statuses")}
            />
            <ListFilterSelect
              value={state.industry}
              onChange={(value) => setState({ industry: value })}
              options={industryOptions}
              allLabel={translate("crm.customers.allIndustries", { ns: "starter" }, "All industries")}
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
              label={translate("crm.customers.fields.createdAt", { ns: "starter" }, "Customer since")}
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
