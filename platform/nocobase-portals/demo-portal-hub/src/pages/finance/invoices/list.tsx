import { useList, useNotification, useTranslate, useUpdate } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import {
  AlertTriangle,
  DollarSign,
  Eye,
  FileClock,
  Pencil,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { CanAccess } from "@/components/access-control/can-access";
import { AccessDenied } from "@/components/access-control/access-denied";
import { DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilterCombobox,
  DataTableFilterDropdownDateRangePicker,
  DataTableFilterDropdownNumeric,
  DataTableFilterDropdownText,
} from "@/components/data-table/data-table-filter";
import { DataTableSorter } from "@/components/data-table/data-table-sorter";
import { DeleteButton } from "@/components/resources/buttons/delete";
import { EditButton } from "@/components/resources/buttons/edit";
import { ShowButton } from "@/components/resources/buttons/show";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { INVOICE_STATUSES, lookup, optionLabel } from "../constants";
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
import { fmtDate, money, PageHeader, Pill } from "../shared";
import type { Invoice } from "../types";
import {
  invoiceAmount,
  invoiceDaysPastDue,
  invoiceDisplayStatus,
  isInvoiceOverdue,
  useInvoiceAmounts,
} from "../invoice-metrics";

const RESOURCE = "hub_fin_invoices";
const STORAGE_KEY = "finance.invoices";

const dayOffsetIso = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export function InvoiceListPage() {
  return (
    <CanAccess resource={RESOURCE} action="list" fallback={<AccessDenied />}>
      <InvoiceList />
    </CanAccess>
  );
}

function InvoiceList() {
  const t = useTranslate();
  const openChild = useOpenContextualChild();
  const notify = useNotification();
  const { mutateAsync: updateInvoice } = useUpdate<Invoice>();
  const invoiceAmounts = useInvoiceAmounts();

  const [density, setDensity] = usePersistentState<Density>(
    `${STORAGE_KEY}.density`,
    "comfortable"
  );
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  // Unpaginated set behind the KPI strip; the table itself pages on the server.
  const { result: allInvoices } = useList<Invoice>({
    resource: RESOURCE,
    pagination: { mode: "off" },
    errorNotification: false,
    queryOptions: { retry: false },
  });

  const statusOptions = useMemo(
    () =>
      INVOICE_STATUSES.map((option) => ({
        value: option.value,
        label: optionLabel(option, t),
      })),
    [t]
  );

  const presetViews: SavedView[] = useMemo(
    () => [
      { id: "all", label: t("finance.invoices.views.all", "All invoices"), filters: [] },
      {
        id: "open",
        label: t("finance.invoices.views.open", "Open"),
        filters: [{ id: "status", value: ["sent", "overdue"] }],
      },
      {
        id: "overdue",
        label: t("finance.invoices.views.overdue", "Overdue"),
        filters: [
          { id: "status", value: ["sent", "overdue"] },
          { id: "due_date", value: ["1970-01-01", dayOffsetIso(-1)] },
        ],
      },
      {
        id: "drafts",
        label: t("finance.invoices.views.drafts", "Drafts"),
        filters: [{ id: "status", value: ["draft"] }],
      },
      {
        id: "dueSoon",
        label: t("finance.invoices.views.dueSoon", "Due in 14 days"),
        filters: [
          { id: "status", value: ["sent", "overdue"] },
          { id: "due_date", value: [dayOffsetIso(0), dayOffsetIso(14)] },
        ],
      },
    ],
    [t]
  );

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<Invoice>();
    return [
      columnHelper.display({
        id: "select",
        size: 44,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={t("finance.ops.selectAll", "Select all")}
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("finance.ops.selectRow", "Select row")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      columnHelper.accessor("invoice_number", {
        id: "invoice_number",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.invoices.col.number", "Invoice #")}</span>
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
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium tabular-nums text-primary underline-offset-2 hover:underline"
            onClick={() => openChild(`show/${row.original.id}`)}
          >
            {row.original.invoice_number}
          </button>
        ),
      }),
      columnHelper.accessor("client_name", {
        id: "client_name",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.invoices.col.client", "Client")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownText
              column={column}
              table={table}
              defaultOperator="contains"
              operators={["contains", "eq"]}
            />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor("amount", {
        id: "amount",
        header: ({ column, table }) => (
          <div className="flex items-center justify-end gap-1">
            <span>{t("finance.invoices.col.amount", "Amount")}</span>
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
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">
            {invoiceAmounts.isLoading || invoiceAmounts.isError
              ? "—"
              : money(invoiceAmount(row.original, invoiceAmounts.byInvoice), true)}
          </div>
        ),
      }),
      columnHelper.accessor("issue_date", {
        id: "issue_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.invoices.col.issued", "Issued")}</span>
            <DataTableSorter column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{fmtDate(getValue())}</span>
        ),
      }),
      columnHelper.accessor("due_date", {
        id: "due_date",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.invoices.col.due", "Due")}</span>
            <DataTableSorter column={column} />
            <DataTableFilterDropdownDateRangePicker column={column} />
          </div>
        ),
        enableSorting: true,
        cell: ({ row }) => {
          const overdue = isInvoiceOverdue(row.original);
          const late = invoiceDaysPastDue(row.original);
          return (
            <div className="flex flex-col">
              <span
                className={cn(
                  "tabular-nums",
                  overdue
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                )}
              >
                {fmtDate(row.original.due_date)}
              </span>
              {overdue && late > 0 && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {t("finance.invoices.daysLate", "{{count}}d late").replace(
                    "{{count}}",
                    String(late)
                  )}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: ({ column, table }) => (
          <div className="flex items-center gap-1">
            <span>{t("finance.invoices.col.status", "Status")}</span>
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
        cell: ({ row }) => {
          const option = lookup(
            INVOICE_STATUSES,
            invoiceDisplayStatus(row.original)
          );
          return <Pill option={option} label={optionLabel(option, t)} />;
        },
      }),
      columnHelper.display({
        id: "actions",
        header: t("finance.common.actions", "Actions"),
        enableSorting: false,
        enableHiding: false,
        size: 144,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <ShowButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              title={t("finance.invoices.view", "View invoice")}
              onClick={() => openChild(`show/${row.original.id}`)}
            >
              <Eye />
            </ShowButton>
            <EditButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              title={t("finance.invoices.edit", "Edit invoice")}
              onClick={() => openChild(`edit/${row.original.id}`)}
            >
              <Pencil />
            </EditButton>
            <DeleteButton
              resource={RESOURCE}
              recordItemId={row.original.id}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              title={t("finance.invoices.delete", "Delete invoice")}
            >
              <Trash2 />
            </DeleteButton>
          </div>
        ),
      }),
    ];
  }, [invoiceAmounts.byInvoice, invoiceAmounts.isError, invoiceAmounts.isLoading, openChild, statusOptions, t]);

  const table = useTable<Invoice>({
    columns,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    initialState: { columnVisibility: storedColumnVisibility(STORAGE_KEY) },
    refineCoreProps: {
      resource: RESOURCE,
      syncWithLocation: true,
      sorters: { initial: [{ field: "issue_date", order: "desc" }] },
    },
  });

  useColumnVisibilityPersistence(STORAGE_KEY, table);
  const savedViews = useSavedViews(STORAGE_KEY, table, presetViews);

  const exportQuery = useList<Invoice>({
    resource: RESOURCE,
    filters: table.refineCore.filters,
    sorters: table.refineCore.sorters,
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    queryOptions: { enabled: false, retry: false },
    errorNotification: false,
  });

  const handleExport = useCallback(async () => {
    const { data } = await exportQuery.query.refetch();
    exportCsv<Invoice>(
      "invoices",
      [
        { header: "Invoice #", value: (row) => row.invoice_number },
        { header: "Client", value: (row) => row.client_name },
        {
          header: "Amount",
          value: (row) => invoiceAmount(row, invoiceAmounts.byInvoice),
        },
        { header: "Issued", value: (row) => row.issue_date },
        { header: "Due", value: (row) => row.due_date },
        { header: "Status", value: (row) => invoiceDisplayStatus(row) },
        { header: "Days late", value: (row) => invoiceDaysPastDue(row) },
      ],
      data?.data ?? []
    );
  }, [exportQuery.query, invoiceAmounts.byInvoice]);

  const selectedRows = table.reactTable.getSelectedRowModel().rows;

  const applyBulkStatus = useCallback(
    async (status: string) => {
      setIsBulkBusy(true);
      try {
        for (const row of selectedRows) {
          await updateInvoice({
            resource: RESOURCE,
            id: row.original.id,
            values: { status },
            successNotification: false,
          });
        }
        notify.open?.({
          type: "success",
          message: t("finance.invoices.bulk.result", "{{count}} invoices updated").replace(
            "{{count}}",
            String(selectedRows.length)
          ),
        });
        table.reactTable.resetRowSelection();
      } finally {
        setIsBulkBusy(false);
      }
    },
    [notify, selectedRows, t, table, updateInvoice]
  );

  const tiles = useMemo<KpiTile[]>(() => {
    const rows = allInvoices?.data ?? [];
    let outstanding = 0;
    let overdue = 0;
    let paid = 0;
    let overdueCount = 0;
    for (const invoice of rows) {
      const amount = invoiceAmount(invoice, invoiceAmounts.byInvoice);
      if (invoice.status === "paid") paid += amount;
      else if (invoice.status !== "draft") outstanding += amount;
      if (isInvoiceOverdue(invoice)) {
        overdue += amount;
        overdueCount += 1;
      }
    }

    return [
      {
        key: "outstanding",
        label: t("finance.invoices.kpi.outstanding", "Outstanding (AR)"),
        value: invoiceAmounts.isLoading || invoiceAmounts.isError ? "—" : money(outstanding),
        hint: t("finance.invoices.kpi.outstanding.hint", "Not yet collected"),
        icon: Wallet,
        tone: "text-blue-600 bg-blue-500/12 dark:text-blue-400",
        onClick: () => savedViews.apply(presetViews[1]),
      },
      {
        key: "overdue",
        label: t("finance.invoices.kpi.overdue", "Overdue"),
        value: invoiceAmounts.isLoading || invoiceAmounts.isError ? "—" : money(overdue),
        hint: t("finance.invoices.kpi.overdue.hint2", "{{count}} invoices past due").replace(
          "{{count}}",
          String(overdueCount)
        ),
        icon: AlertTriangle,
        tone: "text-red-600 bg-red-500/12 dark:text-red-400",
        onClick: () => savedViews.apply(presetViews[2]),
      },
      {
        key: "collected",
        label: t("finance.invoices.kpi.collected", "Collected"),
        value: invoiceAmounts.isLoading || invoiceAmounts.isError ? "—" : money(paid),
        hint: t("finance.invoices.kpi.collected.hint", "Marked paid"),
        icon: DollarSign,
        tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-400",
      },
      {
        key: "total",
        label: t("finance.invoices.kpi.total", "Total invoices"),
        value: String(rows.length),
        hint: t("finance.invoices.kpi.total.hint", "All statuses"),
        icon: FileClock,
        tone: "text-violet-600 bg-violet-500/12 dark:text-violet-400",
      },
    ];
  }, [allInvoices?.data, invoiceAmounts.byInvoice, invoiceAmounts.isError, invoiceAmounts.isLoading, presetViews, savedViews, t]);

  const columnLabels = useMemo(
    () => ({
      invoice_number: t("finance.invoices.col.number", "Invoice #"),
      client_name: t("finance.invoices.col.client", "Client"),
      amount: t("finance.invoices.col.amount", "Amount"),
      issue_date: t("finance.invoices.col.issued", "Issued"),
      due_date: t("finance.invoices.col.due", "Due"),
      status: t("finance.invoices.col.status", "Status"),
    }),
    [t]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("finance.invoices.title", "Invoices")}
        description={t(
          "finance.invoices.subtitle",
          "Accounts receivable — issue, track and collect on client invoices."
        )}
        createResource={RESOURCE}
        createLabel={t("finance.invoices.new", "New invoice")}
      />

      <KpiStrip tiles={tiles} />

      <div className="flex flex-col gap-3">
        <ListToolbar i18nPrefix="finance.ops"
          table={table}
          savedViews={savedViews}
          density={density}
          onDensityChange={setDensity}
          columnLabels={columnLabels}
          onExport={handleExport}
          isExporting={exportQuery.query.isFetching}
        />

        <BulkActionBar i18nPrefix="finance.ops"
          count={selectedRows.length}
          isBusy={isBulkBusy}
          onClear={() => table.reactTable.resetRowSelection()}
        >
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy}
            onClick={() => void applyBulkStatus("sent")}
          >
            {t("finance.invoices.bulk.markSent", "Mark sent")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isBulkBusy}
            onClick={() => void applyBulkStatus("paid")}
          >
            {t("finance.invoices.bulk.markPaid", "Mark paid")}
          </Button>
        </BulkActionBar>

        <div className={densityClass(density)}>
          <DataTable table={table} />
        </div>
      </div>
    </div>
  );
}
