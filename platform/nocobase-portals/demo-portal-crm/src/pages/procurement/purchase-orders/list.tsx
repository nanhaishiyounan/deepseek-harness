import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { CircleDollarSign, Eye, FileClock, Pencil, PackageCheck, Send, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PO_STATUSES,
  PO_TRANSITION_LABELS,
  canTransitionPo,
  formatCurrency,
  formatDate,
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
import { useSupplierOptions } from "../pickers";
import { EnumBadge, useLocale } from "../shared";
import type { PurchaseOrderRecord, PurchaseOrderStatus } from "../types";
import { useOpenContextualChild } from "../route-surfaces";
import { SpendPanel } from "./spend";

const STORAGE_KEY = "procurement.purchaseOrders";

const dayOffsetIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function PurchaseOrdersLayout() {
  return (
    <CanAccess
      resource="hub_po_purchase_orders"
      action="list"
      fallback={<AccessDenied />}
    >
      <PurchaseOrderList />
    </CanAccess>
  );
}

function PurchaseOrderList() {
  const translate = useTranslate();
  const openChild = useOpenContextualChild();
  const locale = useLocale();
  const { options: supplierOptions } = useSupplierOptions();
  const notify = useNotification();
  const { mutateAsync: updateOrder } = useUpdate<PurchaseOrderRecord>();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const { result: allOrders } = useList<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    pagination: { mode: "server", currentPage: 1, pageSize: 500 },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  // The buying desk's working queues.
  const presetViews: SavedView[] = useMemo(
    () => [
      {
        id: "all",
        label: translate("procurement.po.views.all", { ns: "starter" }, "All orders"),
        filters: [],
      },
      {
        id: "draft",
        label: translate("procurement.po.views.draft", { ns: "starter" }, "Drafts"),
        filters: [{ id: "status", value: "draft" }],
      },
      {
        id: "sent",
        label: translate("procurement.po.views.sent", { ns: "starter" }, "Awaiting delivery"),
        filters: [{ id: "status", value: "sent" }],
      },
      {
        id: "received",
        label: translate("procurement.po.views.received", { ns: "starter" }, "Received"),
        filters: [{ id: "status", value: "received" }],
      },
      {
        id: "last30",
        label: translate("procurement.po.views.last30", { ns: "starter" }, "Last 30 days"),
        filters: [{ id: "order_date", value: [dayOffsetIso(-30), dayOffsetIso(1)] }],
      },
    ],
    [translate]
  );

  const statusOptions = useMemo(
    () =>
      PO_STATUSES.map((s) => ({
        value: s.value,
        label: labelFor(PO_STATUSES, s.value, translate),
      })),
    [translate]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<PurchaseOrderRecord>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={translate("procurement.ops.selectAll", { ns: "starter" }, "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={translate("procurement.ops.selectRow", { ns: "starter" }, "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("po_number", {
        id: "po_number",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("procurement.po.fields.poNumber", { ns: "starter" }, "PO number")}
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
          <span className="font-medium">{getValue() || "—"}</span>
        ),
      }),
      columnHelper.accessor((record) => record.supplier?.name, {
        id: "supplier.id",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("procurement.po.fields.supplier", { ns: "starter" }, "Supplier")}
            </span>
            <DataTableFilterCombobox
              column={column}
              table={table}
              options={supplierOptions}
              defaultOperator="eq"
              operators={["eq"]}
            />
          </div>
        ),
        enableSorting: false,
        cell: ({ row }) => row.original.supplier?.name || "—",
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("procurement.po.fields.status", { ns: "starter" }, "Status")}
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
          const value = getValue() ?? "draft";
          return (
            <EnumBadge value={value} label={labelFor(PO_STATUSES, value, translate)} />
          );
        },
      }),
      columnHelper.accessor("order_date", {
        id: "order_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>
              {translate("procurement.po.fields.orderDate", { ns: "starter" }, "Order date")}
            </span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">
            {formatDate(getValue(), locale)}
          </span>
        ),
      }),
      columnHelper.accessor("total", {
        id: "total",
        header: ({ column }) => (
          <div className="flex items-center justify-end gap-1">
            <span>
              {translate("procurement.po.fields.total", { ns: "starter" }, "Total")}
            </span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <div className="text-right tabular-nums">
            {formatCurrency(getValue(), locale)}
          </div>
        ),
      }),
      columnHelper.accessor((record) => record.owner?.nickname, {
        id: "owner",
        header: translate("procurement.po.fields.owner", { ns: "starter" }, "Owner"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.owner?.nickname || row.original.owner?.username || "—",
      }),
      columnHelper.display({
        id: "actions",
        header: translate("procurement.common.actions", { ns: "starter" }, "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ShowButton
              resource="hub_po_purchase_orders"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource="hub_po_purchase_orders"
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource="hub_po_purchase_orders"
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
  }, [locale, openChild, statusOptions, supplierOptions, translate]);

  const table = useTable<PurchaseOrderRecord>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: "hub_po_purchase_orders",
      syncWithLocation: true,
      meta: { appends: ["supplier", "owner"] },
      sorters: { initial: [{ field: "order_date", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<PurchaseOrderRecord>({
    resource: "hub_po_purchase_orders",
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    meta: { appends: ["supplier", "owner"] },
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<PurchaseOrderRecord>(
      "purchase-orders",
      [
        { header: "PO number", value: (row) => row.po_number },
        { header: "Supplier", value: (row) => row.supplier?.name },
        { header: "Status", value: (row) => labelFor(PO_STATUSES, row.status) },
        { header: "Order date", value: (row) => row.order_date?.slice(0, 10) },
        { header: "Total", value: (row) => row.total ?? 0 },
        {
          header: "Owner",
          value: (row) => row.owner?.nickname ?? row.owner?.username,
        },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  // Bulk advance respects the state machine: rows that cannot legally move are
  // skipped rather than silently forced.
  const advanceSelected = useCallback(
    async (target: PurchaseOrderStatus) => {
      const eligible = selectedRows.filter((row) =>
        canTransitionPo(row.original.status, target)
      );
      setIsBulkBusy(true);
      try {
        for (const row of eligible) {
          await updateOrder({
            resource: "hub_po_purchase_orders",
            id: row.original.id,
            values: { status: target },
            successNotification: false,
          });
        }
        notify.open?.({
          type: eligible.length === selectedRows.length ? "success" : "progress",
          message: translate(
            "procurement.po.bulk.result",
            { ns: "starter" },
            "{{done}} of {{total}} orders moved"
          )
            .replace("{{done}}", String(eligible.length))
            .replace("{{total}}", String(selectedRows.length)),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, table, translate, updateOrder]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const orders = allOrders.data;
    const byStatus = new Map<string, { count: number; value: number }>();
    for (const order of orders) {
      const status = order.status ?? "draft";
      const entry = byStatus.get(status) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(order.total ?? 0);
      byStatus.set(status, entry);
    }
    const committed =
      (byStatus.get("draft")?.value ?? 0) + (byStatus.get("sent")?.value ?? 0);

    return [
      {
        key: "open",
        label: translate("procurement.po.kpi.open", { ns: "starter" }, "Open orders"),
        value: String(
          (byStatus.get("draft")?.count ?? 0) + (byStatus.get("sent")?.count ?? 0)
        ),
        hint: translate(
          "procurement.po.kpi.open.hint",
          { ns: "starter" },
          "Draft or awaiting delivery"
        ),
        icon: FileClock,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "sent",
        label: translate("procurement.po.kpi.awaiting", { ns: "starter" }, "Awaiting delivery"),
        value: String(byStatus.get("sent")?.count ?? 0),
        hint: translate(
          "procurement.po.kpi.awaiting.hint",
          { ns: "starter" },
          "Sent to the supplier"
        ),
        icon: Send,
        tone: "text-amber-600 bg-amber-500/12 dark:text-amber-400",
        onClick: () => savedViews.apply(presetViews[2]),
      },
      {
        key: "committed",
        label: translate("procurement.po.kpi.committed", { ns: "starter" }, "Committed spend"),
        value: formatCurrency(committed, locale),
        hint: translate(
          "procurement.po.kpi.committed.hint",
          { ns: "starter" },
          "Value of orders not yet received"
        ),
        icon: CircleDollarSign,
        tone: "text-teal-600 bg-teal-500/12 dark:text-teal-400",
      },
      {
        key: "received",
        label: translate("procurement.po.kpi.received", { ns: "starter" }, "Received"),
        value: String(byStatus.get("received")?.count ?? 0),
        hint: translate(
          "procurement.po.kpi.received.hint",
          { ns: "starter" },
          "{{value}} landed"
        ).replace("{{value}}", formatCurrency(byStatus.get("received")?.value ?? 0, locale)),
        icon: PackageCheck,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
        onClick: () => savedViews.apply(presetViews[3]),
      },
    ];
  }, [allOrders.data, locale, presetViews, savedViews, translate]);

  const columnLabels = useMemo(
    () => ({
      po_number: translate("procurement.po.fields.poNumber", { ns: "starter" }, "PO number"),
      "supplier.id": translate("procurement.po.fields.supplier", { ns: "starter" }, "Supplier"),
      status: translate("procurement.po.fields.status", { ns: "starter" }, "Status"),
      order_date: translate("procurement.po.fields.orderDate", { ns: "starter" }, "Order date"),
      total: translate("procurement.po.fields.total", { ns: "starter" }, "Total"),
      owner: translate("procurement.po.fields.owner", { ns: "starter" }, "Owner"),
    }),
    [translate]
  );

  return (
    <ListView resource="hub_po_purchase_orders">
      <KpiStrip tiles={tiles} />
      <SpendPanel />

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
          {(["sent", "received", "cancelled"] as PurchaseOrderStatus[]).map((target) => {
            const eligible = selectedRows.filter((row) =>
              canTransitionPo(row.original.status, target)
            ).length;
            return (
              <Button
                key={target}
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={isBulkBusy || eligible === 0}
                title={
                  eligible === 0
                    ? translate(
                        "procurement.po.bulk.noneEligible",
                        { ns: "starter" },
                        "None of the selected orders can make this move"
                      )
                    : undefined
                }
                onClick={() => void advanceSelected(target)}
              >
                {translate(
                  PO_TRANSITION_LABELS[target].i18nKey,
                  { ns: "starter" },
                  PO_TRANSITION_LABELS[target].label
                )}
                {eligible > 0 && (
                  <span className="ml-1 tabular-nums text-muted-foreground">({eligible})</span>
                )}
              </Button>
            );
          })}
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </ListView>
  );
}
