import { useList, useTranslate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Boxes, Coins, Eye, MapPin, PackageSearch, Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableFilterDropdownText } from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { formatCurrency, formatNumber } from "../constants";
import { useOnHandBy, useOnHandMatrix } from "../aggregates";
import {
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
import { useOpenContextualChild } from "../route-surfaces";
import { useLocale } from "../shared";
import type { ProductRecord, WarehouseRecord } from "../types";

const STORAGE_KEY = "inventory.warehouses";

export function WarehousesLayout() {
  return (
    <CanAccess
      resource="hub_inv_warehouses"
      action="list"
      fallback={<AccessDenied />}
    >
      <WarehouseList />
    </CanAccess>
  );
}

function WarehouseList() {
  const translate = useTranslate();
  const locale = useLocale();
  const emptyValue = translate(
    "inventory.common.emptyValue",
    { ns: "starter" },
    "—"
  );
  const openChild = useOpenContextualChild();
  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );

  const { totals: unitsByWarehouse } = useOnHandBy("warehouse_id");
  const { cells } = useOnHandMatrix();

  const { result: allWarehouses } = useList<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });
  const { result: allProducts } = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const warehouseMetrics = useMemo(() => {
    const prices = new Map(
      allProducts.data.map((product) => [
        String(product.id),
        Number(product.unit_price ?? 0),
      ])
    );
    const skus = new Map<string, number>();
    const values = new Map<string, number>();

    for (const [key, qty] of cells) {
      if (qty === 0) continue;
      const [productId, warehouseId] = key.split("::");
      skus.set(warehouseId, (skus.get(warehouseId) ?? 0) + 1);
      values.set(
        warehouseId,
        (values.get(warehouseId) ?? 0) + qty * (prices.get(productId) ?? 0)
      );
    }

    const totalUnits = Array.from(unitsByWarehouse.values()).reduce(
      (sum, qty) => sum + qty,
      0
    );
    const totalValue = Array.from(values.values()).reduce(
      (sum, value) => sum + value,
      0
    );

    return { skus, values, totalUnits, totalValue };
  }, [allProducts.data, cells, unitsByWarehouse]);

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<WarehouseRecord>();
    return [
      columnHelper.accessor("name", {
        id: "name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.warehouses.fields.name", { ns: "starter" }, "Name")}</span>
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
          <span className="font-medium">{getValue() || emptyValue}</span>
        ),
      }),
      columnHelper.accessor("code", {
        id: "code",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.warehouses.fields.code", { ns: "starter" }, "Code")}</span>
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq", "startswith"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue() || emptyValue}</span>
        ),
      }),
      columnHelper.accessor("location", {
        id: "location",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.warehouses.fields.location", { ns: "starter" }, "Location")}</span>
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq", "startswith"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => getValue() || emptyValue,
      }),
      columnHelper.display({
        id: "units",
        header: translate("inventory.warehouses.fields.unitsOnHand", { ns: "starter" }, "Units on hand"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {formatNumber(unitsByWarehouse.get(String(row.original.id)) ?? 0, locale)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "skus",
        header: translate("inventory.warehouses.fields.skus", { ns: "starter" }, "Distinct SKUs"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatNumber(warehouseMetrics.skus.get(String(row.original.id)) ?? 0, locale)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "value",
        header: () => (
          <div className="text-right">
            {translate("inventory.warehouses.fields.value", { ns: "starter" }, "Stock value")}
          </div>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatCurrency(
              warehouseMetrics.values.get(String(row.original.id)) ?? 0,
              locale
            )}
          </div>
        ),
      }),
      columnHelper.display({
        id: "share",
        header: translate("inventory.warehouses.fields.share", { ns: "starter" }, "Unit share"),
        enableSorting: false,
        cell: ({ row }) => {
          const units = unitsByWarehouse.get(String(row.original.id)) ?? 0;
          const share = warehouseMetrics.totalUnits === 0
            ? 0
            : units / warehouseMetrics.totalUnits;
          const width = Math.min(100, Math.max(0, share * 100));
          return (
            <div className="min-w-24 space-y-1.5">
              <span className="text-xs tabular-nums">
                {new Intl.NumberFormat(locale, {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(share)}
              </span>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: translate("inventory.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="hub_inv_warehouses"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_inv_warehouses"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_inv_warehouses"
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
  }, [emptyValue, locale, openChild, translate, unitsByWarehouse, warehouseMetrics]);

  const table = useTable<WarehouseRecord>({
    columns,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_inv_warehouses",
      syncWithLocation: true,
      sorters: { initial: [{ field: "name", order: "asc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, []);

  const exportQuery = useList<WarehouseRecord>({
    resource: "hub_inv_warehouses",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<WarehouseRecord>(
      "warehouses",
      [
        {
          header: translate("inventory.warehouses.fields.name", { ns: "starter" }, "Name"),
          value: (row) => row.name,
        },
        {
          header: translate("inventory.warehouses.fields.code", { ns: "starter" }, "Code"),
          value: (row) => row.code,
        },
        {
          header: translate("inventory.warehouses.fields.location", { ns: "starter" }, "Location"),
          value: (row) => row.location,
        },
        {
          header: translate("inventory.warehouses.fields.unitsOnHand", { ns: "starter" }, "Units on hand"),
          value: (row) => unitsByWarehouse.get(String(row.id)) ?? 0,
        },
        {
          header: translate("inventory.warehouses.fields.skus", { ns: "starter" }, "Distinct SKUs"),
          value: (row) => warehouseMetrics.skus.get(String(row.id)) ?? 0,
        },
        {
          header: translate("inventory.warehouses.fields.value", { ns: "starter" }, "Stock value"),
          value: (row) => warehouseMetrics.values.get(String(row.id)) ?? 0,
        },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query, translate, unitsByWarehouse, warehouseMetrics]);

  const tiles = useMemo<KpiTile[]>(
    () => [
      {
        key: "locations",
        label: translate("inventory.warehouses.kpi.locations", { ns: "starter" }, "Locations"),
        value: formatNumber(allWarehouses.data.length, locale),
        hint: translate(
          "inventory.warehouses.kpi.locations.hint",
          { ns: "starter" },
          "Stocking locations in the network"
        ),
        icon: MapPin,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
      {
        key: "units",
        label: translate("inventory.warehouses.kpi.units", { ns: "starter" }, "Units held"),
        value: formatNumber(warehouseMetrics.totalUnits, locale),
        hint: translate(
          "inventory.warehouses.kpi.units.hint",
          { ns: "starter" },
          "Summed across all locations"
        ),
        icon: Boxes,
        tone: "text-sky-600 bg-sky-500/12 dark:text-sky-400",
      },
      {
        key: "value",
        label: translate("inventory.warehouses.kpi.value", { ns: "starter" }, "Stock value"),
        value: formatCurrency(warehouseMetrics.totalValue, locale),
        hint: translate(
          "inventory.warehouses.kpi.value.hint",
          { ns: "starter" },
          "On-hand units at unit price"
        ),
        icon: Coins,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "empty",
        label: translate("inventory.warehouses.kpi.empty", { ns: "starter" }, "Empty locations"),
        value: formatNumber(
          allWarehouses.data.filter(
            (warehouse) =>
              (unitsByWarehouse.get(String(warehouse.id)) ?? 0) === 0
          ).length,
          locale
        ),
        hint: translate(
          "inventory.warehouses.kpi.empty.hint",
          { ns: "starter" },
          "Locations currently holding no stock"
        ),
        icon: PackageSearch,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
    ],
    [allWarehouses.data, locale, translate, unitsByWarehouse, warehouseMetrics]
  );

  const columnLabels = useMemo(
    () => ({
      name: translate("inventory.warehouses.fields.name", { ns: "starter" }, "Name"),
      code: translate("inventory.warehouses.fields.code", { ns: "starter" }, "Code"),
      location: translate("inventory.warehouses.fields.location", { ns: "starter" }, "Location"),
      units: translate("inventory.warehouses.fields.unitsOnHand", { ns: "starter" }, "Units on hand"),
      skus: translate("inventory.warehouses.fields.skus", { ns: "starter" }, "Distinct SKUs"),
      value: translate("inventory.warehouses.fields.value", { ns: "starter" }, "Stock value"),
      share: translate("inventory.warehouses.fields.share", { ns: "starter" }, "Unit share"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_inv_warehouses">
      <KpiStrip tiles={tiles} />

      <div className="flex flex-col gap-3">
        <ListToolbar i18nPrefix="inventory.ops"
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
