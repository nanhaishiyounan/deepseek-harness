import {
  useList,
  useNotification,
  useTranslate,
  useUpdate,
  type CrudFilter,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { CalendarRange, Eye, Pencil, Trash2, Undo2, UserCheck, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilterDropdownDateRangePicker } from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListView } from "@/components/resources/views/list-view";
import { cn } from "@/lib/utils";
import { assigneeName, formatDate, todayIso } from "../constants";
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
} from "@/lib/table-kit";
import { Pill, useLocale } from "../shared";
import type { AssetRecord, AssignmentRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";
import { runAssignmentAssetTransition } from "./transitions";

const STORAGE_KEY = "assets.assignments";

type AssignmentScope = "all" | "active" | "returned";

const SCOPES: Array<{ value: AssignmentScope; label: string; i18nKey: string }> = [
  { value: "all", label: "All", i18nKey: "assets.assignments.views.all" },
  { value: "active", label: "Active", i18nKey: "assets.assignments.views.active" },
  { value: "returned", label: "Returned", i18nKey: "assets.assignments.views.returned" },
];

export function AssignmentList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const notify = useNotification();
  const { mutateAsync: updateAssignmentAsync } = useUpdate<AssignmentRecord>();
  const { mutateAsync: updateAssetAsync } = useUpdate<AssetRecord>();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const { result: allAssignments } = useList<AssignmentRecord>({
    resource: "hub_as_assignments",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const returnAssignment = useCallback(
    async (assignment: AssignmentRecord) => {
      try {
        await runAssignmentAssetTransition({
          updateAssignment: () =>
            updateAssignmentAsync({
              resource: "hub_as_assignments",
              id: assignment.id,
              values: { returned_date: todayIso() },
              successNotification: false,
            }),
          updateAsset: () =>
            assignment.asset_id == null
              ? Promise.resolve()
              : updateAssetAsync({
                  resource: "hub_as_assets",
                  id: assignment.asset_id,
                  values: { status: "in_stock" },
                  successNotification: false,
                }),
          rollbackAssignment: () =>
            updateAssignmentAsync({
              resource: "hub_as_assignments",
              id: assignment.id,
              values: { returned_date: assignment.returned_date ?? null },
              successNotification: false,
            }),
        });
      } catch {
        notify.open?.({
          type: "error",
          message: translate(
            "assets.assignments.returnFailed",
            { ns: "starter" },
            "The return failed and the assignment was restored. Try again."
          ),
        });
      }
    },
    [notify, translate, updateAssetAsync, updateAssignmentAsync]
  );

  // Active vs returned is a null-check on `returned_date`, which no column
  // filter widget expresses, so it rides on the table's permanent filter instead
  // of the saved-view mechanism.
  const [scope, setScope] = usePersistentState<AssignmentScope>(
    `${STORAGE_KEY}.scope`,
    "all"
  );

  // NocoBase's `$null` operator does not apply to these date columns, but a
  // plain equality against null does — verified against the live collection.
  const scopeFilters = useMemo<CrudFilter[]>(() => {
    if (scope === "active") {
      return [{ field: "returned_date", operator: "eq", value: null }];
    }
    if (scope === "returned") {
      return [{ field: "returned_date", operator: "ne", value: null }];
    }
    return [];
  }, [scope]);

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<AssignmentRecord>();
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
      columnHelper.accessor((row) => row.asset?.name, {
        id: "asset",
        header: translate("assets.assignments.columns.asset", { ns: "starter" }, "Asset"),
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
      columnHelper.accessor((row) => row.assignee, {
        id: "assignee",
        header: translate("assets.assignments.columns.assignee", { ns: "starter" }, "Assignee"),
        enableSorting: false,
        cell: ({ row }) => assigneeName(row.original.assignee),
      }),
      columnHelper.accessor("assigned_date", {
        id: "assigned_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assignments.columns.assigned", { ns: "starter" }, "Assigned")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue(), locale)}</span>
        ),
      }),
      columnHelper.accessor("returned_date", {
        id: "returned_date",
        header: translate("assets.assignments.columns.status", { ns: "starter" }, "Status"),
        enableSorting: false,
        cell: ({ getValue }) => {
          const returned = getValue();
          return returned ? (
            <span className="whitespace-nowrap text-muted-foreground">
              {translate("assets.assignments.returnedPrefix", { ns: "starter" }, "Returned")}{" "}
              {formatDate(returned, locale)}
            </span>
          ) : (
            <Pill
              label={translate("assets.assignments.active", { ns: "starter" }, "Active")}
              className="bg-blue-500/15 text-blue-700 dark:text-blue-300"
            />
          );
        },
      }),
      columnHelper.display({
        id: "duration",
        header: translate("assets.assignments.columns.heldFor", { ns: "starter" }, "Held for"),
        enableSorting: false,
        size: 110,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {heldForLabel(row.original, translate)}
          </span>
        ),
      }),
      columnHelper.accessor("note", {
        id: "note",
        header: translate("assets.assignments.fields.note", { ns: "starter" }, "Note"),
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
        size: 200,
        cell: ({ row }) => {
          const active = !row.original.returned_date;
          return (
            <div className="flex items-center gap-1">
              {active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => returnAssignment(row.original)}
                >
                  <Undo2 />
                  {translate("assets.assignments.actions.return", { ns: "starter" }, "Return")}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                title={translate("assets.common.view", { ns: "starter" }, "View")}
                onClick={() => openChild(`show/${row.original.id}`)}
              >
                <Eye />
              </Button>
              <EditButton
                resource="hub_as_assignments"
                recordItemId={row.original.id}
                variant="ghost"
                size="icon"
                onClick={() => openChild(`edit/${row.original.id}`)}
              >
                <Pencil />
              </EditButton>
              <DeleteButton
                resource="hub_as_assignments"
                recordItemId={row.original.id}
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 />
              </DeleteButton>
            </div>
          );
        },
      }),
    ];
  }, [locale, openChild, returnAssignment, translate]);

  const table = useTable<AssignmentRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_as_assignments",
      syncWithLocation: true,
      meta: { appends: ["asset", "assignee"] },
      filters: { permanent: scopeFilters },
      sorters: { initial: [{ field: "assigned_date", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, []);

  const exportQuery = useList<AssignmentRecord>({
    resource: "hub_as_assignments",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["asset", "assignee"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<AssignmentRecord>(
      "assignments",
      [
        { header: "Asset", value: (row) => row.asset?.name },
        { header: "Asset tag", value: (row) => row.asset?.tag },
        { header: "Assignee", value: (row) => assigneeName(row.assignee) },
        { header: "Assigned", value: (row) => row.assigned_date?.slice(0, 10) },
        { header: "Returned", value: (row) => row.returned_date?.slice(0, 10) },
        { header: "Note", value: (row) => row.note },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;
  const returnableRows = selectedRows.filter((row) => !row.original.returned_date);

  const returnSelected = useCallback(async () => {
    setIsBulkBusy(true);
    try {
      for (const row of returnableRows) {
        await runAssignmentAssetTransition({
          updateAssignment: () =>
            updateAssignmentAsync({
              resource: "hub_as_assignments",
              id: row.original.id,
              values: { returned_date: todayIso() },
              successNotification: false,
            }),
          updateAsset: () =>
            row.original.asset_id == null
              ? Promise.resolve()
              : updateAssetAsync({
                  resource: "hub_as_assets",
                  id: row.original.asset_id,
                  values: { status: "in_stock" },
                  successNotification: false,
                }),
          rollbackAssignment: () =>
            updateAssignmentAsync({
              resource: "hub_as_assignments",
              id: row.original.id,
              values: { returned_date: row.original.returned_date ?? null },
              successNotification: false,
            }),
        });
      }
      notify.open?.({
        type: "success",
        message: translate(
          "assets.assignments.bulk.returnResult",
          { ns: "starter" },
          "{{count}} devices returned to stock"
        ).replace("{{count}}", String(returnableRows.length)),
      });
      table.reactTable.resetRowSelection();
    } catch {
      notify.open?.({
        type: "error",
        message: translate(
          "assets.assignments.bulk.returnFailed",
          { ns: "starter" },
          "A return failed. Its assignment was restored; no further selected rows were changed."
        ),
      });
    } finally {
      setIsBulkBusy(false);
    }
  }, [notify, returnableRows, table, translate, updateAssetAsync, updateAssignmentAsync]);

  const tiles = useMemo<KpiTile[]>(() => {
    const rows = allAssignments.data;
    const active = rows.filter((row) => !row.returned_date);
    const holders = new Set(
      active.map((row) => String(row.assignee_id ?? row.assignee?.id ?? ""))
    );
    holders.delete("");
    const longest = active.reduce((max, row) => {
      if (!row.assigned_date) return max;
      const days = Math.round(
        (Date.now() - new Date(row.assigned_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      return Math.max(max, days);
    }, 0);

    return [
      {
        key: "active",
        label: translate("assets.assignments.kpi.active", { ns: "starter" }, "Active"),
        value: String(active.length),
        hint: translate(
          "assets.assignments.kpi.active.hint",
          { ns: "starter" },
          "Devices currently out"
        ),
        icon: UserCheck,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => setScope(scope === "active" ? "all" : "active"),
        active: scope === "active",
      },
      {
        key: "holders",
        label: translate("assets.assignments.kpi.holders", { ns: "starter" }, "People holding kit"),
        value: String(holders.size),
        hint: translate(
          "assets.assignments.kpi.holders.hint",
          { ns: "starter" },
          "Distinct assignees"
        ),
        icon: Users,
        tone: "text-sky-600 bg-sky-500/12 dark:text-sky-400",
      },
      {
        key: "returned",
        label: translate("assets.assignments.kpi.returned", { ns: "starter" }, "Returned"),
        value: String(rows.length - active.length),
        hint: translate(
          "assets.assignments.kpi.returned.hint",
          { ns: "starter" },
          "Closed assignments"
        ),
        icon: Undo2,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "longest",
        label: translate("assets.assignments.kpi.longest", { ns: "starter" }, "Longest held"),
        value: translate("assets.assignments.kpi.longest.value", { ns: "starter" }, "{{count}}d").replace(
          "{{count}}",
          String(longest)
        ),
        hint: translate(
          "assets.assignments.kpi.longest.hint",
          { ns: "starter" },
          "Oldest open assignment"
        ),
        icon: CalendarRange,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
    ];
  }, [allAssignments.data, scope, setScope, translate]);

  const columnLabels = useMemo(
    () => ({
      asset: translate("assets.assignments.columns.asset", { ns: "starter" }, "Asset"),
      assignee: translate("assets.assignments.columns.assignee", { ns: "starter" }, "Assignee"),
      assigned_date: translate("assets.assignments.columns.assigned", { ns: "starter" }, "Assigned"),
      returned_date: translate("assets.assignments.columns.status", { ns: "starter" }, "Status"),
      duration: translate("assets.assignments.columns.heldFor", { ns: "starter" }, "Held for"),
      note: translate("assets.assignments.fields.note", { ns: "starter" }, "Note"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_as_assignments">
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
        >
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                scope === option.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted"
              )}
            >
              {translate(option.i18nKey, { ns: "starter" }, option.label)}
            </button>
          ))}
        </ListToolbar>

        <BulkActionBar i18nPrefix="assets.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy || returnableRows.length === 0}
            onClick={() => void returnSelected()}
          >
            <Undo2 className="size-3.5" />
            {translate(
              "assets.assignments.bulk.return",
              { ns: "starter" },
              "Return {{count}} devices"
            ).replace("{{count}}", String(returnableRows.length))}
          </Button>
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </ListView>
  );
}

function heldForLabel(
  assignment: AssignmentRecord,
  translate: ReturnType<typeof useTranslate>
) {
  if (!assignment.assigned_date) return "—";
  const start = new Date(assignment.assigned_date).getTime();
  const end = assignment.returned_date
    ? new Date(assignment.returned_date).getTime()
    : Date.now();
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  return translate("assets.assignments.daysValue", { ns: "starter" }, "{{count}} days").replace(
    "{{count}}",
    String(days)
  );
}
