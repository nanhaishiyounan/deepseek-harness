import {
  useList,
  useTranslate,
  type CrudFilter,
} from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownText,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  categoryBadgeClass,
  formatCurrency,
  formatDate,
  labelFor,
  statusBadgeClass,
} from "../constants";
import {
  ListToolbar,
  exportCsv,
  storedColumnVisibility,
  useColumnVisibilityPersistence,
  usePersistentState,
  useSavedViews,
  densityClass,
  type Density,
  type SavedView,
} from "@/lib/table-kit";
import { Pill, useLocale } from "../shared";
import type { AssetRecord } from "../types";
import { useOpenContextualChild } from "../route-surfaces";
import { AssetsKpi } from "./kpi";

const STORAGE_KEY = "assets.assets";

// Preset views mirror how an ITAM team actually slices the register: by
// lifecycle state first, then by the two categories that dominate the fleet.
const PRESET_VIEWS: SavedView[] = [
  { id: "all", label: "All assets", filters: [] },
  { id: "in-stock", label: "In stock", filters: [{ id: "status", value: "in_stock" }] },
  { id: "assigned", label: "Assigned", filters: [{ id: "status", value: "assigned" }] },
  { id: "repair", label: "In repair", filters: [{ id: "status", value: "repair" }] },
  { id: "retired", label: "Retired", filters: [{ id: "status", value: "retired" }] },
  { id: "laptops", label: "Laptops", filters: [{ id: "category", value: "laptop" }] },
];

export function AssetList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );

  // Full set (unpaginated) powers the KPI tiles + charts above the table.
  const { result: allAssets } = useList<AssetRecord>({
    resource: "hub_as_assets",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const categoryOptions = useMemo(
    () =>
      ASSET_CATEGORIES.map((c) => ({
        value: c.value,
        label: labelFor(ASSET_CATEGORIES, c.value, translate),
      })),
    [translate]
  );
  const statusOptions = useMemo(
    () =>
      ASSET_STATUSES.map((s) => ({
        value: s.value,
        label: labelFor(ASSET_STATUSES, s.value, translate),
      })),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<AssetRecord>();
    return [
      columnHelper.accessor("tag", {
        id: "tag",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assets.fields.tag", { ns: "starter" }, "Tag")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq", "startswith"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue() || "—"}
          </span>
        ),
      }),
      columnHelper.accessor("name", {
        id: "name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assets.fields.name", { ns: "starter" }, "Name")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq", "startswith"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("category", {
        id: "category",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assets.fields.category", { ns: "starter" }, "Category")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={categoryOptions}
              defaultOperator="eq"
              operators={["eq", "in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? (
            <Pill
              label={labelFor(ASSET_CATEGORIES, value, translate)}
              className={categoryBadgeClass(value)}
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
            <span>{translate("assets.assets.fields.status", { ns: "starter" }, "Status")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={statusOptions}
              defaultOperator="eq"
              operators={["eq", "in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "in_stock";
          return (
            <Pill
              label={labelFor(ASSET_STATUSES, value, translate)}
              className={statusBadgeClass(value)}
            />
          );
        },
      }),
      columnHelper.accessor("value", {
        id: "value",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assets.fields.value", { ns: "starter" }, "Value")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{formatCurrency(getValue(), locale)}</span>
        ),
      }),
      columnHelper.accessor("purchase_date", {
        id: "purchase_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("assets.assets.fields.purchased", { ns: "starter" }, "Purchased")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{formatDate(getValue(), locale)}</span>
        ),
      }),
      columnHelper.display({
        id: "age",
        header: translate("assets.assets.fields.age", { ns: "starter" }, "Age"),
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {ageLabel(row.original.purchase_date, translate)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: translate("assets.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="hub_as_assets"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_as_assets"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_as_assets"
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
  }, [categoryOptions, locale, openChild, statusOptions, translate]);

  const table = useTable<AssetRecord>({
    columns,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_as_assets",
      syncWithLocation: true,
      sorters: { initial: [{ field: "tag", order: "asc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, PRESET_VIEWS);

  const activeFilters = table.refineCore.filters;
  const activeStatus = statusFromFilters(activeFilters);

  // The export pulls the *filtered* set from the server, not just the page.
  const exportQuery = useList<AssetRecord>({
    resource: "hub_as_assets",
    filters: activeFilters,
    sorters: table.refineCore.sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<AssetRecord>(
      "assets",
      [
        { header: "Tag", value: (row) => row.tag },
        { header: "Name", value: (row) => row.name },
        { header: "Category", value: (row) => labelFor(ASSET_CATEGORIES, row.category) },
        { header: "Status", value: (row) => labelFor(ASSET_STATUSES, row.status) },
        { header: "Value", value: (row) => row.value ?? 0 },
        { header: "Purchase date", value: (row) => row.purchase_date?.slice(0, 10) },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const columnLabels = useMemo(
    () => ({
      tag: translate("assets.assets.fields.tag", { ns: "starter" }, "Tag"),
      name: translate("assets.assets.fields.name", { ns: "starter" }, "Name"),
      category: translate("assets.assets.fields.category", { ns: "starter" }, "Category"),
      status: translate("assets.assets.fields.status", { ns: "starter" }, "Status"),
      value: translate("assets.assets.fields.value", { ns: "starter" }, "Value"),
      purchase_date: translate("assets.assets.fields.purchased", { ns: "starter" }, "Purchased"),
      age: translate("assets.assets.fields.age", { ns: "starter" }, "Age"),
    }),
    [translate]
  );

  const toggleStatusFilter = useCallback(
    (status: string) => {
      const column = table.reactTable.getColumn("status");
      column?.setFilterValue(activeStatus === status ? undefined : status);
    },
    [activeStatus, table]
  );

  return (
    <ListView resource="hub_as_assets">
      <AssetsKpi
        assets={allAssets.data}
        locale={locale}
        activeStatus={activeStatus}
        onSelectStatus={toggleStatusFilter}
      />

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

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </ListView>
  );
}

/** Reads the current single-value status filter, if any, for KPI highlighting. */
function statusFromFilters(filters: CrudFilter[]): string | undefined {
  for (const filter of filters) {
    if ("field" in filter && filter.field === "status" && typeof filter.value === "string") {
      return filter.value;
    }
  }
  return undefined;
}

/** "3y 2m" style age from the purchase date — the ITAM refresh signal. */
function ageLabel(
  purchaseDate: string | null | undefined,
  translate: ReturnType<typeof useTranslate>
) {
  if (!purchaseDate) return "—";
  const months = Math.max(
    0,
    Math.round(
      (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    )
  );
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearUnit = translate("assets.assets.age.years", { ns: "starter" }, "y");
  const monthUnit = translate("assets.assets.age.months", { ns: "starter" }, "mo");
  return years > 0 ? `${years}${yearUnit} ${rest}${monthUnit}` : `${rest}${monthUnit}`;
}
