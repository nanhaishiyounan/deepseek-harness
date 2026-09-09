import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  CircleDollarSign,
  Eye,
  FileClock,
  Pencil,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownNumeric,
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
import { useSupplierOrderStats } from "../aggregates";
import { formatCurrency, SUPPLIER_STATUSES, labelFor } from "../constants";
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
import { useOpenContextualChild } from "../route-surfaces";
import { EnumBadge, RatingStars, useLocale } from "../shared";
import type { SupplierRecord, SupplierStatus } from "../types";

const STORAGE_KEY = "procurement.suppliers";

export function SuppliersLayout() {
  return (
    <CanAccess
      resource="hub_po_suppliers"
      action="list"
      fallback={<AccessDenied />}
    >
      <SupplierList />
    </CanAccess>
  );
}

function SupplierList() {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const locale = useLocale();
  const notify = useNotification();
  const { mutateAsync: updateSupplier } = useUpdate<SupplierRecord>();
  const { statsBySupplier } = useSupplierOrderStats();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const { result: allSuppliers } = useList<SupplierRecord>({
    resource: "hub_po_suppliers",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const presetViews: SavedView[] = useMemo(
    () => [
      {
        id: "all",
        label: translate(
          "procurement.suppliers.views.all",
          { ns: "starter" },
          "All suppliers"
        ),
        filters: [],
      },
      {
        id: "active",
        label: translate(
          "procurement.suppliers.views.active",
          { ns: "starter" },
          "Active"
        ),
        filters: [{ id: "status", value: "active" }],
      },
      {
        id: "inactive",
        label: translate(
          "procurement.suppliers.views.inactive",
          { ns: "starter" },
          "Inactive"
        ),
        filters: [{ id: "status", value: "inactive" }],
      },
      {
        id: "top-rated",
        label: translate(
          "procurement.suppliers.views.topRated",
          { ns: "starter" },
          "Top rated"
        ),
        filters: [{ id: "rating", value: "4" }],
      },
    ],
    [translate]
  );

  const statusOptions = useMemo(
    () =>
      SUPPLIER_STATUSES.map((status) => ({
        value: status.value,
        label: labelFor(SUPPLIER_STATUSES, status.value, translate),
      })),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<SupplierRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={translate(
              "procurement.ops.selectAll",
              { ns: "starter" },
              "Select all"
            )}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={translate(
              "procurement.ops.selectRow",
              { ns: "starter" },
              "Select row"
            )}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("name", {
        id: "name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate(
                "procurement.suppliers.fields.name",
                { ns: "starter" },
                "Supplier"
              )}
            </span>
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
          <span className="font-medium">
            {getValue() ||
              translate(
                "procurement.common.notAvailable",
                { ns: "starter" },
                "—"
              )}
          </span>
        ),
      }),
      columnHelper.accessor("contact_name", {
        id: "contact_name",
        header: translate(
          "procurement.suppliers.fields.contact",
          { ns: "starter" },
          "Contact"
        ),
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue() ||
          translate("procurement.common.notAvailable", { ns: "starter" }, "—"),
      }),
      columnHelper.accessor("email", {
        id: "email",
        header: translate(
          "procurement.suppliers.fields.email",
          { ns: "starter" },
          "Email"
        ),
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue() ||
          translate("procurement.common.notAvailable", { ns: "starter" }, "—"),
      }),
      columnHelper.accessor("rating", {
        id: "rating",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate(
                "procurement.suppliers.fields.rating",
                { ns: "starter" },
                "Rating"
              )}
            </span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownNumeric
              column={column}
              table={table}
              defaultOperator="gte"
              operators={["gte", "lte", "eq"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => <RatingStars value={getValue()} />,
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate(
                "procurement.suppliers.fields.status",
                { ns: "starter" },
                "Status"
              )}
            </span>
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
            <EnumBadge
              value={value}
              label={labelFor(SUPPLIER_STATUSES, value, translate)}
            />
          );
        },
      }),
      columnHelper.display({
        id: "orders",
        header: translate(
          "procurement.suppliers.fields.orders",
          { ns: "starter" },
          "Orders"
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {statsBySupplier.get(String(row.original.id))?.orders ?? 0}
          </span>
        ),
      }),
      columnHelper.display({
        id: "spend",
        header: () => (
          <div className="text-right">
            {translate(
              "procurement.suppliers.fields.spend",
              { ns: "starter" },
              "Total spend"
            )}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatCurrency(
              statsBySupplier.get(String(row.original.id))?.spend ?? 0,
              locale
            )}
          </div>
        ),
      }),
      columnHelper.display({
        id: "open_spend",
        header: () => (
          <div className="text-right">
            {translate(
              "procurement.suppliers.fields.openSpend",
              { ns: "starter" },
              "Open commitment"
            )}
          </div>
        ),
        cell: ({ row }) => {
          const openSpend =
            statsBySupplier.get(String(row.original.id))?.openSpend ?? 0;
          return (
            <div
              className={
                openSpend > 0
                  ? "text-right tabular-nums text-amber-600 dark:text-amber-400"
                  : "text-right tabular-nums"
              }
            >
              {formatCurrency(openSpend, locale)}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: translate(
          "procurement.common.actions",
          { ns: "starter" },
          "Actions"
        ),
        enableSorting: false,
        enableHiding: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="hub_po_suppliers"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_po_suppliers"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_po_suppliers"
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
  }, [locale, openChild, statsBySupplier, statusOptions, translate]);

  const table = useTable<SupplierRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_po_suppliers",
      syncWithLocation: true,
      sorters: { initial: [{ field: "name", order: "asc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<SupplierRecord>({
    resource: "hub_po_suppliers",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<SupplierRecord>(
      "suppliers",
      [
        {
          header: translate("procurement.suppliers.fields.name", { ns: "starter" }, "Supplier"),
          value: (row) => row.name,
        },
        {
          header: translate("procurement.suppliers.fields.contact", { ns: "starter" }, "Contact"),
          value: (row) => row.contact_name,
        },
        {
          header: translate("procurement.suppliers.fields.email", { ns: "starter" }, "Email"),
          value: (row) => row.email,
        },
        {
          header: translate("procurement.suppliers.fields.rating", { ns: "starter" }, "Rating"),
          value: (row) => row.rating,
        },
        {
          header: translate("procurement.suppliers.fields.status", { ns: "starter" }, "Status"),
          value: (row) => labelFor(SUPPLIER_STATUSES, row.status, translate),
        },
        {
          header: translate("procurement.suppliers.fields.orders", { ns: "starter" }, "Orders"),
          value: (row) => statsBySupplier.get(String(row.id))?.orders ?? 0,
        },
        {
          header: translate("procurement.suppliers.fields.spend", { ns: "starter" }, "Total spend"),
          value: (row) => statsBySupplier.get(String(row.id))?.spend ?? 0,
        },
        {
          header: translate(
            "procurement.suppliers.fields.openSpend",
            { ns: "starter" },
            "Open commitment"
          ),
          value: (row) => statsBySupplier.get(String(row.id))?.openSpend ?? 0,
        },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query, statsBySupplier, translate]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  const applyBulkStatus = useCallback(
    async (status: SupplierStatus) => {
      setIsBulkBusy(true);
      try {
        for (const row of selectedRows) {
          await updateSupplier({
            resource: "hub_po_suppliers",
            id: row.original.id,
            values: { status },
            successNotification: false,
          });
        }
        notify.open?.({
          type: "success",
          message: translate(
            "procurement.suppliers.bulk.result",
            { ns: "starter" },
            "{{count}} suppliers updated"
          ).replace("{{count}}", String(selectedRows.length)),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, table, translate, updateSupplier]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const suppliers = allSuppliers.data;
    const active = suppliers.filter((supplier) => supplier.status === "active").length;
    const ratings = suppliers
      .map((supplier) => supplier.rating)
      .filter((rating): rating is number => rating != null);
    const totalSpend = Array.from(statsBySupplier.values()).reduce(
      (sum, stats) => sum + stats.spend,
      0
    );
    const openSpend = Array.from(statsBySupplier.values()).reduce(
      (sum, stats) => sum + stats.openSpend,
      0
    );
    const averageRating = ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : 0;

    return [
      {
        key: "active",
        label: translate(
          "procurement.suppliers.kpi.active",
          { ns: "starter" },
          "Active suppliers"
        ),
        value: String(active),
        icon: Users,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
        onClick: () => savedViews.apply(presetViews[1]),
        active: savedViews.activeId === "active",
      },
      {
        key: "spend",
        label: translate(
          "procurement.suppliers.kpi.spend",
          { ns: "starter" },
          "Total spend"
        ),
        value: formatCurrency(totalSpend, locale),
        icon: CircleDollarSign,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "open-spend",
        label: translate(
          "procurement.suppliers.kpi.openSpend",
          { ns: "starter" },
          "Open commitment"
        ),
        value: formatCurrency(openSpend, locale),
        icon: FileClock,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
      },
      {
        key: "average-rating",
        label: translate(
          "procurement.suppliers.kpi.averageRating",
          { ns: "starter" },
          "Average rating"
        ),
        value: averageRating.toFixed(1),
        icon: Star,
        tone: "text-violet-600 bg-violet-500/12 dark:text-violet-400",
        onClick: () => savedViews.apply(presetViews[3]),
        active: savedViews.activeId === "top-rated",
      },
    ];
  }, [allSuppliers.data, locale, presetViews, savedViews, statsBySupplier, translate]);

  const columnLabels = useMemo(
    () => ({
      name: translate("procurement.suppliers.fields.name", { ns: "starter" }, "Supplier"),
      contact_name: translate("procurement.suppliers.fields.contact", { ns: "starter" }, "Contact"),
      email: translate("procurement.suppliers.fields.email", { ns: "starter" }, "Email"),
      rating: translate("procurement.suppliers.fields.rating", { ns: "starter" }, "Rating"),
      status: translate("procurement.suppliers.fields.status", { ns: "starter" }, "Status"),
      orders: translate("procurement.suppliers.fields.orders", { ns: "starter" }, "Orders"),
      spend: translate("procurement.suppliers.fields.spend", { ns: "starter" }, "Total spend"),
      open_spend: translate(
        "procurement.suppliers.fields.openSpend",
        { ns: "starter" },
        "Open commitment"
      ),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_po_suppliers">
      <KpiStrip tiles={tiles} />

      <div className="flex flex-col gap-3">
        <ListToolbar i18nPrefix="procurement.ops"
          table={table}
          savedViews={savedViews}
          density={density}
          onDensityChange={setDensity}
          columnLabels={columnLabels}
          onExport={handleExport}
          isExporting={exportQuery.query.isFetching}
        />

        <BulkActionBar i18nPrefix="procurement.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={isBulkBusy}
                >
                  {translate(
                    "procurement.suppliers.bulk.setStatus",
                    { ns: "starter" },
                    "Set status"
                  )}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {translate(
                  "procurement.suppliers.fields.status",
                  { ns: "starter" },
                  "Status"
                )}
              </DropdownMenuLabel>
              {SUPPLIER_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status.value}
                  onClick={() => void applyBulkStatus(status.value)}
                >
                  {labelFor(SUPPLIER_STATUSES, status.value, translate)}
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
