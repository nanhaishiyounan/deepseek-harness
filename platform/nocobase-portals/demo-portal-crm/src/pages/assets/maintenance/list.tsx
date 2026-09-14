import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  Pencil,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownDateRangePicker,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListView } from "@/components/resources/views/list-view";
import { cn } from "@/lib/utils";
import {
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  maintenanceStatusBadgeClass,
  maintenanceTypeBadgeClass,
  todayIso,
} from "../constants";
import {
  BulkActionBar,
  KpiStrip,
  ListToolbar,
  densityClass,
  exportCsv,
  storedColumnVisibility,
  useColumnVisibilityPersistence,
  usePersistentState,
  useSavedViews,
  type Density,
  type KpiTile,
  type SavedView,
} from "@/lib/table-kit";
import { Pill, useLocale } from "../shared";
import type { MaintenanceRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";

const STORAGE_KEY = "assets.maintenance";
const OPEN_STATUSES = ["Scheduled", "In progress"];

const dayOffsetIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function MaintenanceList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const notify = useNotification();
  const { mutateAsync: updateRecord } = useUpdate<MaintenanceRecord>();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  // Unpaginated set behind the KPI strip — the service backlog at a glance.
  const { result: allRecords } = useList<MaintenanceRecord>({
    resource: "hub_as_maintenance",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const statusOptions = useMemo(
    () =>
      MAINTENANCE_STATUSES.map((status) => ({
        value: status.value,
        label: labelFor(MAINTENANCE_STATUSES, status.value, translate),
      })),
    [translate]
  );
  const typeOptions = useMemo(
    () =>
      MAINTENANCE_TYPES.map((type) => ({
        value: type.value,
        label: labelFor(MAINTENANCE_TYPES, type.value, translate),
      })),
    [translate]
  );

  // Views are the service desk's working queues; dates are resolved on render so
  // "this week" always means the current week.
  const presetViews: SavedView[] = useMemo(
    () => [
      {
        id: "all",
        label: translate("assets.maintenance.views.all", { ns: "starter" }, "All work"),
        filters: [],
      },
      {
        id: "open",
        label: translate("assets.maintenance.views.open", { ns: "starter" }, "Open"),
        filters: [{ id: "status", value: OPEN_STATUSES }],
      },
      {
        id: "overdue",
        label: translate("assets.maintenance.views.overdue", { ns: "starter" }, "Overdue"),
        filters: [
          { id: "status", value: OPEN_STATUSES },
          { id: "scheduled_date", value: [dayOffsetIso(-3650), dayOffsetIso(-1)] },
        ],
      },
      {
        id: "week",
        label: translate("assets.maintenance.views.dueThisWeek", { ns: "starter" }, "Due this week"),
        filters: [
          { id: "status", value: OPEN_STATUSES },
          { id: "scheduled_date", value: [dayOffsetIso(0), dayOffsetIso(7)] },
        ],
      },
      {
        id: "done",
        label: translate("assets.maintenance.views.completed", { ns: "starter" }, "Completed"),
        filters: [{ id: "status", value: ["Done"] }],
      },
      {
        id: "preventive",
        label: translate("assets.maintenance.views.preventive", { ns: "starter" }, "Preventive"),
        filters: [{ id: "type", value: ["Preventive"] }],
      },
    ],
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<MaintenanceRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={translate("assets.ops.selectAll", { ns: "starter" }, "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={translate("assets.ops.selectRow", { ns: "starter" }, "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: translate("assets.maintenance.columns.title", { ns: "starter" }, "Title"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.title || "—"}</span>
        ),
      }),
      columnHelper.accessor((row) => row.asset?.name, {
        id: "asset",
        header: translate("assets.maintenance.columns.asset", { ns: "starter" }, "Asset"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.asset?.name || "—"}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.asset?.tag || ""}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("type", {
        id: "type",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.maintenance.columns.type", { ns: "starter" }, "Type")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={typeOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? (
            <Pill
              label={labelFor(MAINTENANCE_TYPES, value, translate)}
              className={maintenanceTypeBadgeClass(value)}
            />
          ) : (
            "—"
          );
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.maintenance.columns.status", { ns: "starter" }, "Status")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={statusOptions}
              multiple
              defaultOperator="in"
              operators={["in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? (
            <Pill
              label={labelFor(MAINTENANCE_STATUSES, value, translate)}
              className={maintenanceStatusBadgeClass(value)}
            />
          ) : (
            "—"
          );
        },
      }),
      columnHelper.accessor("scheduled_date", {
        id: "scheduled_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.maintenance.columns.scheduled", { ns: "starter" }, "Scheduled")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row }) => {
          const value = row.original.scheduled_date;
          const isOpen = row.original.status !== "Done";
          const days = daysUntil(value);
          return (
            <div className="flex flex-col">
              <span className="whitespace-nowrap">{formatDate(value, locale)}</span>
              {isOpen && days !== null && days <= 7 && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    days < 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {days < 0
                    ? translate(
                        "assets.maintenance.overdueBy",
                        { ns: "starter" },
                        "{{count}}d overdue"
                      ).replace("{{count}}", String(Math.abs(days)))
                    : translate(
                        "assets.maintenance.dueIn",
                        { ns: "starter" },
                        "due in {{count}}d"
                      ).replace("{{count}}", String(days))}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("cost", {
        id: "cost",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatCurrency(getValue(), locale)}</span>
        ),
      }),
      columnHelper.accessor("vendor", {
        id: "vendor",
        header: translate("assets.maintenance.fields.vendor", { ns: "starter" }, "Vendor"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue() || "—"}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: translate("assets.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title={translate("assets.common.view", { ns: "starter" }, "View")}
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </Button>
            <EditButton
              resource="hub_as_maintenance"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_as_maintenance"
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
  }, [locale, openChild, statusOptions, translate, typeOptions]);

  const table = useTable<MaintenanceRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_as_maintenance",
      syncWithLocation: true,
      meta: { appends: ["asset"] },
      sorters: { initial: [{ field: "scheduled_date", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<MaintenanceRecord>({
    resource: "hub_as_maintenance",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["asset"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<MaintenanceRecord>(
      "asset-maintenance",
      [
        { header: "Title", value: (row) => row.title },
        { header: "Asset", value: (row) => row.asset?.name },
        { header: "Asset tag", value: (row) => row.asset?.tag },
        { header: "Type", value: (row) => row.type },
        { header: "Status", value: (row) => row.status },
        { header: "Scheduled", value: (row) => row.scheduled_date?.slice(0, 10) },
        { header: "Completed", value: (row) => row.completed_date?.slice(0, 10) },
        { header: "Cost", value: (row) => row.cost ?? 0 },
        { header: "Vendor", value: (row) => row.vendor },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  const markSelectedDone = useCallback(async () => {
    setIsBulkBusy(true);
    try {
      for (const row of selectedRows) {
        await updateRecord({
          resource: "hub_as_maintenance",
          id: row.original.id,
          values: { status: "Done", completed_date: todayIso() },
          successNotification: false,
        });
      }
      notify.open?.({
        type: "success",
        message: translate(
          "assets.maintenance.bulk.doneResult",
          { ns: "starter" },
          "{{count}} records closed"
        ).replace("{{count}}", String(selectedRows.length)),
      });
      table.reactTable.resetRowSelection();
    } finally {
      setIsBulkBusy(false);
    }
  }, [notify, selectedRows, table, translate, updateRecord]);

  const tiles = useMemo<KpiTile[]>(() => {
    const records = allRecords.data;
    const open = records.filter((row) => row.status !== "Done");
    const overdue = open.filter((row) => (daysUntil(row.scheduled_date) ?? 1) < 0);
    const dueSoon = open.filter((row) => {
      const days = daysUntil(row.scheduled_date);
      return days !== null && days >= 0 && days <= 30;
    });
    const spend = records
      .filter((row) => row.status === "Done")
      .reduce((sum, row) => sum + Number(row.cost ?? 0), 0);

    return [
      {
        key: "open",
        label: translate("assets.maintenance.kpi.open", { ns: "starter" }, "Open work"),
        value: String(open.length),
        hint: translate(
          "assets.maintenance.kpi.open.hint",
          { ns: "starter" },
          "Scheduled or in progress"
        ),
        icon: CalendarClock,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "overdue",
        label: translate("assets.maintenance.kpi.overdue", { ns: "starter" }, "Overdue"),
        value: String(overdue.length),
        hint: translate(
          "assets.maintenance.kpi.overdue.hint",
          { ns: "starter" },
          "Past the scheduled date"
        ),
        icon: AlertTriangle,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => savedViews.apply(presetViews[2]),
      },
      {
        key: "due",
        label: translate("assets.maintenance.kpi.dueSoon", { ns: "starter" }, "Due in 30 days"),
        value: String(dueSoon.length),
        hint: translate(
          "assets.maintenance.kpi.dueSoon.hint",
          { ns: "starter" },
          "Plan capacity for these"
        ),
        icon: CheckCircle2,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
        onClick: () => savedViews.apply(presetViews[3]),
      },
      {
        key: "spend",
        label: translate("assets.maintenance.kpi.spend", { ns: "starter" }, "Completed spend"),
        value: formatCurrency(spend, locale),
        hint: translate(
          "assets.maintenance.kpi.spend.hint",
          { ns: "starter" },
          "Across all closed work"
        ),
        icon: Wallet,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
    ];
  }, [allRecords.data, locale, presetViews, savedViews, translate]);

  const columnLabels = useMemo(
    () => ({
      title: translate("assets.maintenance.columns.title", { ns: "starter" }, "Title"),
      asset: translate("assets.maintenance.columns.asset", { ns: "starter" }, "Asset"),
      type: translate("assets.maintenance.columns.type", { ns: "starter" }, "Type"),
      status: translate("assets.maintenance.columns.status", { ns: "starter" }, "Status"),
      scheduled_date: translate("assets.maintenance.columns.scheduled", { ns: "starter" }, "Scheduled"),
      cost: translate("assets.maintenance.fields.cost", { ns: "starter" }, "Cost"),
      vendor: translate("assets.maintenance.fields.vendor", { ns: "starter" }, "Vendor"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_as_maintenance">
      <KpiStrip tiles={tiles} />

      <div className="flex flex-col gap-3">
        <ListToolbar i18nPrefix="assets.ops"
          table={table}
          savedViews={savedViews}
          density={density}
          onDensityChange={setDensity}
          columnLabels={columnLabels}
          onExport={handleExport}
          isExporting={exportQuery.query.isFetching}
        />

        <BulkActionBar i18nPrefix="assets.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy}
            onClick={() => void markSelectedDone()}
          >
            <CheckCircle2 className="size-3.5" />
            {translate("assets.maintenance.bulk.markDone", { ns: "starter" }, "Mark completed")}
          </Button>
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </ListView>
  );
}
