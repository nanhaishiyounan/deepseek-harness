import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { Boxes, Coins, Eye, Pencil, TriangleAlert, PackageSearch, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  PRODUCT_STATUSES,
  formatCurrency,
  labelFor,
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
import { EnumBadge, useLocale } from "../shared";
import { useOpenContextualChild } from "../route-surfaces";
import type { ProductRecord } from "../types";
import { useOnHandBy } from "../aggregates";

const STORAGE_KEY = "inventory.products";

export function ProductsLayout() {
  return (
    <CanAccess
      resource="hub_inv_products"
      action="list"
      fallback={<AccessDenied />}
    >
      <ProductList />
    </CanAccess>
  );
}

/** On-hand quantity per product, summed on the server. */
export function useOnHandByProduct() {
  return useOnHandBy("product_id").totals;
}

function ProductList() {
  const translate = useTranslate();
  const locale = useLocale();
  const openChild = useOpenContextualChild();
  const onHand = useOnHandByProduct();
  const notify = useNotification();
  const { mutateAsync: updateProduct } = useUpdate<ProductRecord>();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  // Unpaginated catalog behind the KPI strip.
  const { result: allProducts } = useList<ProductRecord>({
    resource: "hub_inv_products",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const presetViews: SavedView[] = useMemo(
    () => [
      {
        id: "all",
        label: translate("inventory.products.views.all", { ns: "starter" }, "All products"),
        filters: [],
      },
      {
        id: "active",
        label: translate("inventory.products.views.active", { ns: "starter" }, "Active"),
        filters: [{ id: "status", value: "active" }],
      },
      {
        id: "discontinued",
        label: translate("inventory.products.views.discontinued", { ns: "starter" }, "Discontinued"),
        filters: [{ id: "status", value: "discontinued" }],
      },
      {
        id: "electronics",
        label: translate("inventory.products.views.electronics", { ns: "starter" }, "Electronics"),
        filters: [{ id: "category", value: "electronics" }],
      },
    ],
    [translate]
  );

  const categoryOptions = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        value: c.value,
        label: labelFor(CATEGORIES, c.value, translate),
      })),
    [translate]
  );
  const statusOptions = useMemo(
    () =>
      PRODUCT_STATUSES.map((s) => ({
        value: s.value,
        label: labelFor(PRODUCT_STATUSES, s.value, translate),
      })),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<ProductRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={translate("inventory.ops.selectAll", { ns: "starter" }, "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={translate("inventory.ops.selectRow", { ns: "starter" }, "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("sku", {
        id: "sku",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.products.fields.sku", { ns: "starter" }, "SKU")}</span>
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
          <span className="font-mono text-xs">{getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor("name", {
        id: "name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.products.fields.name", { ns: "starter" }, "Name")}</span>
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
            <span>{translate("inventory.products.fields.category", { ns: "starter" }, "Category")}</span>
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
            <EnumBadge value={value} label={labelFor(CATEGORIES, value, translate)} />
          ) : (
            "—"
          );
        },
      }),
      columnHelper.accessor("unit_price", {
        id: "unit_price",
        header: translate("inventory.products.fields.unitPrice", { ns: "starter" }, "Unit price"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {formatCurrency(getValue(), locale)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "on_hand",
        header: translate("inventory.products.fields.onHand", { ns: "starter" }, "On hand"),
        enableSorting: false,
        cell: ({ row }) => {
          const qty = onHand.get(String(row.original.id)) ?? 0;
          const reorder = Number(row.original.reorder_level ?? 0);
          const low = qty <= reorder;
          return (
            <span
              className={cn(
                "tabular-nums font-medium",
                low && "text-red-600 dark:text-red-400"
              )}
            >
              {qty}
              {low ? (
                <span className="ml-1 text-xs font-normal">
                  · {translate("inventory.products.lowFlag", { ns: "starter" }, "low")}
                </span>
              ) : null}
            </span>
          );
        },
      }),
      columnHelper.accessor("reorder_level", {
        id: "reorder_level",
        header: translate("inventory.products.fields.reorderAt", { ns: "starter" }, "Reorder at"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-muted-foreground">
            {getValue() ?? "—"}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.products.fields.status", { ns: "starter" }, "Status")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={statusOptions}
              defaultOperator="eq"
              operators={["eq"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "active";
          return (
            <EnumBadge value={value} label={labelFor(PRODUCT_STATUSES, value, translate)} />
          );
        },
      }),
      columnHelper.display({
        id: "stock_value",
        header: translate("inventory.products.fields.stockValue", { ns: "starter" }, "Stock value"),
        enableSorting: false,
        cell: ({ row }) => {
          const qty = onHand.get(String(row.original.id)) ?? 0;
          return (
            <span className="tabular-nums">
              {formatCurrency(qty * Number(row.original.unit_price ?? 0), locale)}
            </span>
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
              resource="hub_inv_products"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_inv_products"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_inv_products"
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
  }, [categoryOptions, locale, onHand, openChild, statusOptions, translate]);

  const table = useTable<ProductRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_inv_products",
      syncWithLocation: true,
      sorters: { initial: [{ field: "name", order: "asc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<ProductRecord>({
    resource: "hub_inv_products",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<ProductRecord>(
      "products",
      [
        { header: "SKU", value: (row) => row.sku },
        { header: "Name", value: (row) => row.name },
        { header: "Category", value: (row) => labelFor(CATEGORIES, row.category) },
        { header: "Unit price", value: (row) => row.unit_price ?? 0 },
        { header: "On hand", value: (row) => onHand.get(String(row.id)) ?? 0 },
        { header: "Reorder level", value: (row) => row.reorder_level ?? 0 },
        { header: "Status", value: (row) => labelFor(PRODUCT_STATUSES, row.status) },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query, onHand]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  const applyBulkStatus = useCallback(
    async (status: string) => {
      setIsBulkBusy(true);
      try {
        for (const row of selectedRows) {
          await updateProduct({
            resource: "hub_inv_products",
            id: row.original.id,
            values: { status },
            successNotification: false,
          });
        }
        notify.open?.({
          type: "success",
          message: translate(
            "inventory.products.bulk.statusDone",
            { ns: "starter" },
            "{{count}} products updated"
          ).replace("{{count}}", String(selectedRows.length)),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, table, translate, updateProduct]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const catalog = allProducts.data;
    let units = 0;
    let value = 0;
    let low = 0;
    for (const product of catalog) {
      const qty = onHand.get(String(product.id)) ?? 0;
      units += qty;
      value += qty * Number(product.unit_price ?? 0);
      if ((product.status ?? "active") === "active" && qty <= Number(product.reorder_level ?? 0)) {
        low += 1;
      }
    }
    const active = catalog.filter((product) => (product.status ?? "active") === "active");

    return [
      {
        key: "skus",
        label: translate("inventory.products.kpi.skus", { ns: "starter" }, "Active SKUs"),
        value: String(active.length),
        hint: translate(
          "inventory.products.kpi.skus.hint",
          { ns: "starter" },
          "{{count}} in the catalog"
        ).replace("{{count}}", String(catalog.length)),
        icon: PackageSearch,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "units",
        label: translate("inventory.products.kpi.units", { ns: "starter" }, "Units on hand"),
        value: String(units),
        hint: translate(
          "inventory.products.kpi.units.hint",
          { ns: "starter" },
          "Summed across all locations"
        ),
        icon: Boxes,
        tone: "text-sky-600 bg-sky-500/12 dark:text-sky-400",
      },
      {
        key: "value",
        label: translate("inventory.products.kpi.value", { ns: "starter" }, "Stock value"),
        value: formatCurrency(value, locale),
        hint: translate(
          "inventory.products.kpi.value.hint",
          { ns: "starter" },
          "On-hand units at unit price"
        ),
        icon: Coins,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "low",
        label: translate("inventory.products.kpi.low", { ns: "starter" }, "Below reorder"),
        value: String(low),
        hint: translate(
          "inventory.products.kpi.low.hint",
          { ns: "starter" },
          "Active SKUs needing a top-up"
        ),
        icon: TriangleAlert,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
      },
    ];
  }, [allProducts.data, locale, onHand, presetViews, savedViews, translate]);

  const columnLabels = useMemo(
    () => ({
      sku: translate("inventory.products.fields.sku", { ns: "starter" }, "SKU"),
      name: translate("inventory.products.fields.name", { ns: "starter" }, "Name"),
      category: translate("inventory.products.fields.category", { ns: "starter" }, "Category"),
      unit_price: translate("inventory.products.fields.unitPrice", { ns: "starter" }, "Unit price"),
      on_hand: translate("inventory.products.fields.onHand", { ns: "starter" }, "On hand"),
      reorder_level: translate("inventory.products.fields.reorderAt", { ns: "starter" }, "Reorder at"),
      status: translate("inventory.products.fields.status", { ns: "starter" }, "Status"),
      stock_value: translate("inventory.products.fields.stockValue", { ns: "starter" }, "Stock value"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_inv_products">
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

        <BulkActionBar i18nPrefix="inventory.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="text-xs" disabled={isBulkBusy}>
                  {translate("inventory.products.bulk.setStatus", { ns: "starter" }, "Set status")}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {translate("inventory.products.fields.status", { ns: "starter" }, "Status")}
              </DropdownMenuLabel>
              {PRODUCT_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => void applyBulkStatus(status.value)}
                >
                  {labelFor(PRODUCT_STATUSES, status.value, translate)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </ListView>
  );
}
