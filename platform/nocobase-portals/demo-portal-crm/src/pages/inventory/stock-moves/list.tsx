import { useList, useTranslate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownToLine, ArrowUpFromLine, Eye, Pencil, Scale, Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownDateRangePicker,
  DataTableFilterDropdownText,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { ListView } from "@/components/resources/views/list-view";
import { MOVE_TYPES, formatDateTime, formatNumber, labelFor, signedQty } from "../constants";
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
  type SavedView,
} from "@/lib/table-kit";
import { EnumBadge, useLocale } from "../shared";
import { useOpenContextualChild } from "../route-surfaces";
import type { StockMoveRecord } from "../types";

const STORAGE_KEY = "inventory.stockMoves";

const dayOffsetIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function StockMovesLayout() {
  return (
    <CanAccess
      resource="hub_inv_stock_moves"
      action="list"
      fallback={<AccessDenied />}
    >
      <StockMoveList />
    </CanAccess>
  );
}

function StockMoveList() {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const locale = useLocale();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );

  // The ledger KPIs are computed over the recent window the audit view cares
  // about; the full history stays on the server.
  const { result: recentMoves } = useList<StockMoveRecord>({
    resource: "hub_inv_stock_moves",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    sorters: [{ field: "moved_at", order: "desc" }],
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const presetViews: SavedView[] = useMemo(
    () => [
      {
        id: "all",
        label: translate("inventory.stockMoves.views.all", { ns: "starter" }, "All moves"),
        filters: [],
      },
      {
        id: "receipts",
        label: translate("inventory.stockMoves.views.receipts", { ns: "starter" }, "Receipts"),
        filters: [{ id: "type", value: "in" }],
      },
      {
        id: "issues",
        label: translate("inventory.stockMoves.views.issues", { ns: "starter" }, "Issues"),
        filters: [{ id: "type", value: "out" }],
      },
      {
        id: "adjustments",
        label: translate("inventory.stockMoves.views.adjustments", { ns: "starter" }, "Adjustments"),
        filters: [{ id: "type", value: "adjust" }],
      },
      {
        id: "last30",
        label: translate("inventory.stockMoves.views.last30", { ns: "starter" }, "Last 30 days"),
        filters: [{ id: "moved_at", value: [dayOffsetIso(-30), dayOffsetIso(1)] }],
      },
    ],
    [translate]
  );

  const typeOptions = useMemo(
    () =>
      MOVE_TYPES.map((t) => ({
        value: t.value,
        label: labelFor(MOVE_TYPES, t.value, translate),
      })),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<StockMoveRecord>();
    return [
      columnHelper.accessor("moved_at", {
        id: "moved_at",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.stockMoves.fields.date", { ns: "starter" }, "Date")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">
            {formatDateTime(getValue(), locale)}
          </span>
        ),
      }),
      columnHelper.display({
        id: "product",
        header: translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.product?.name || "—"}
          </span>
        ),
      }),
      columnHelper.display({
        id: "warehouse",
        header: translate("inventory.stockMoves.fields.warehouse", { ns: "starter" }, "Warehouse"),
        enableSorting: false,
        cell: ({ row }) => row.original.warehouse?.name || "—",
      }),
      columnHelper.accessor("type", {
        id: "type",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.stockMoves.fields.type", { ns: "starter" }, "Type")}</span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={typeOptions}
              defaultOperator="eq"
              operators={["eq", "in"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => {
          const value = getValue() ?? "in";
          return <EnumBadge value={value} label={labelFor(MOVE_TYPES, value, translate)} />;
        },
      }),
      columnHelper.accessor("qty", {
        id: "qty",
        header: translate("inventory.stockMoves.fields.qty", { ns: "starter" }, "Qty"),
        enableSorting: false,
        cell: ({ row }) => {
          const signed = signedQty(row.original.type, row.original.qty);
          return (
            <span
              className={
                "tabular-nums font-medium " +
                (signed < 0 ? "text-red-600 dark:text-red-400" : "")
              }
            >
              {signed > 0 ? "+" : ""}
              {signed}
            </span>
          );
        },
      }),
      columnHelper.accessor("note", {
        id: "note",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{translate("inventory.stockMoves.fields.note", { ns: "starter" }, "Note")}</span>
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue() || "—"}</span>
        ),
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
              resource="hub_inv_stock_moves"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_inv_stock_moves"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_inv_stock_moves"
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
  }, [locale, openChild, translate, typeOptions]);

  const table = useTable<StockMoveRecord>({
    columns,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_inv_stock_moves",
      syncWithLocation: true,
      meta: { appends: ["product", "warehouse"] },
      sorters: { initial: [{ field: "moved_at", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<StockMoveRecord>({
    resource: "hub_inv_stock_moves",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["product", "warehouse"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<StockMoveRecord>(
      "stock-moves",
      [
        { header: "Date", value: (row) => row.moved_at },
        { header: "Product", value: (row) => row.product?.name },
        { header: "SKU", value: (row) => row.product?.sku },
        { header: "Warehouse", value: (row) => row.warehouse?.name },
        { header: "Type", value: (row) => labelFor(MOVE_TYPES, row.type) },
        { header: "Signed qty", value: (row) => signedQty(row.type, row.qty) },
        { header: "Note", value: (row) => row.note },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const tiles = useMemo<KpiTile[]>(() => {
    const moves = recentMoves.data;
    let inbound = 0;
    let outbound = 0;
    let adjustments = 0;
    for (const move of moves) {
      const qty = Number(move.qty ?? 0);
      if (move.type === "out") outbound += qty;
      else if (move.type === "adjust") adjustments += qty;
      else inbound += qty;
    }

    return [
      {
        key: "in",
        label: translate("inventory.stockMoves.kpi.inbound", { ns: "starter" }, "Units received"),
        value: formatNumber(inbound, locale),
        hint: translate(
          "inventory.stockMoves.kpi.inbound.hint",
          { ns: "starter" },
          "Across the latest 500 moves"
        ),
        icon: ArrowDownToLine,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "out",
        label: translate("inventory.stockMoves.kpi.outbound", { ns: "starter" }, "Units issued"),
        value: formatNumber(outbound, locale),
        hint: translate(
          "inventory.stockMoves.kpi.outbound.hint",
          { ns: "starter" },
          "Shipped or consumed"
        ),
        icon: ArrowUpFromLine,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => savedViews.apply(presetViews[2]),
      },
      {
        key: "adjust",
        label: translate("inventory.stockMoves.kpi.adjustments", { ns: "starter" }, "Adjustments"),
        value: formatNumber(adjustments, locale),
        hint: translate(
          "inventory.stockMoves.kpi.adjustments.hint",
          { ns: "starter" },
          "Counted corrections"
        ),
        icon: Scale,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
        onClick: () => savedViews.apply(presetViews[3]),
      },
      {
        key: "net",
        label: translate("inventory.stockMoves.kpi.net", { ns: "starter" }, "Net movement"),
        value: formatNumber(inbound + adjustments - outbound, locale),
        hint: translate(
          "inventory.stockMoves.kpi.net.hint",
          { ns: "starter" },
          "Receipts plus adjustments, less issues"
        ),
        icon: Scale,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
      },
    ];
  }, [locale, presetViews, recentMoves.data, savedViews, translate]);

  const columnLabels = useMemo(
    () => ({
      moved_at: translate("inventory.stockMoves.fields.date", { ns: "starter" }, "Date"),
      product: translate("inventory.stockMoves.fields.product", { ns: "starter" }, "Product"),
      warehouse: translate("inventory.stockMoves.fields.warehouse", { ns: "starter" }, "Warehouse"),
      type: translate("inventory.stockMoves.fields.type", { ns: "starter" }, "Type"),
      qty: translate("inventory.stockMoves.fields.qty", { ns: "starter" }, "Qty"),
      note: translate("inventory.stockMoves.fields.note", { ns: "starter" }, "Note"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_inv_stock_moves">
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
